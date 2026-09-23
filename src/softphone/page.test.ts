import { describe, expect, it } from 'vitest';
import { expose, pageOptions, READOUT_KEY, withoutPassword } from './page';
import type { Softphone } from './Softphone';

describe('pageOptions', () => {
  it('reads the fields and the two flags from a query string', () => {
    expect(pageOptions('?ws=ws%3A%2F%2F10.0.0.2%3A8088&uri=sip%3A1001%4010.0.0.2&password=pw&target=sip%3A1002%4010.0.0.2&register=1&answer=true'))
      .toEqual({
        socket: 'ws://10.0.0.2:8088',
        uri: 'sip:1001@10.0.0.2',
        password: 'pw',
        target: 'sip:1002@10.0.0.2',
        register: true,
        answer: true,
      });
  });

  it('treats an absent or empty value as not given, and anything but 1 or true as off', () => {
    expect(pageOptions('?uri=&register=0&answer=yes')).toEqual({
      socket: undefined, uri: undefined, password: undefined, target: undefined, register: false, answer: false,
    });
    expect(pageOptions('')).toMatchObject({ register: false, answer: false });
  });
});

describe('withoutPassword', () => {
  it('removes the password and nothing else', () => {
    expect(withoutPassword('http://127.0.0.1:8080/softphone.html?uri=sip%3A1001%40x&password=pw&register=1'))
      .toBe('http://127.0.0.1:8080/softphone.html?uri=sip%3A1001%40x&register=1');
  });

  it('says so when there was nothing to remove, so the history is left alone', () => {
    expect(withoutPassword('http://127.0.0.1:8080/softphone.html?uri=sip%3A1001%40x')).toBeUndefined();
  });
});

describe('expose', () => {
  it('hangs a readout on the window that reads through to the phone, and takes it down again', async () => {
    const calls: string[] = [];
    const phone = {
      state: { registration: 'registered', call: 'idle' },
      history: [{ at: 1, registration: 'registered', call: 'idle' }],
      stats: () => Promise.resolve({ packetsSent: 3 }),
      call: (target: string) => { calls.push(target); },
      answer: () => { calls.push('answer'); },
      hangUp: () => { calls.push('hangUp'); },
    } as unknown as Softphone;
    const target = {} as Window;

    const remove = expose(target, phone);
    const readout = target[READOUT_KEY]!;
    expect(readout.version).toBe(1);
    expect(readout.state()).toEqual({ registration: 'registered', call: 'idle' });
    expect(readout.history()).toHaveLength(1);
    expect(await readout.stats()).toEqual({ packetsSent: 3 });
    readout.call('sip:1002@x');
    readout.answer();
    readout.hangUp();
    expect(calls).toEqual(['sip:1002@x', 'answer', 'hangUp']);

    remove();
    expect(target[READOUT_KEY]).toBeUndefined();
  });
});
