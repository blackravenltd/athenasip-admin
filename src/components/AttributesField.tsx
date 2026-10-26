import { useId } from 'react';
import type { Attributes } from '../api/types';

/** Attributes as the text an operator edits: pretty JSON, or empty for none. */
export function attributesText(attributes: Attributes | undefined): string {
  return attributes && Object.keys(attributes).length > 0 ? JSON.stringify(attributes, null, 2) : '';
}

/**
 * The text read back as attributes, or the reason it cannot be. Empty is no
 * attributes at all. The node replaces the whole set when given one, so what
 * is sent is everything the text holds.
 */
export function parseAttributes(text: string): { attributes: Attributes } | { problem: string } {
  if (!text.trim()) return { attributes: {} };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    return { problem: `The attributes are not JSON: ${cause instanceof Error ? cause.message : String(cause)}.` };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { problem: 'The attributes have to be a JSON object, in braces.' };
  }
  return { attributes: value as Attributes };
}

/** A whole set of attributes, edited as JSON. */
export function AttributesField({ value, busy, onChange, hint }: {
  value: string;
  busy: boolean;
  onChange: (text: string) => void;
  /** What the routing scripts read from these, in words. */
  hint?: React.ReactNode;
}) {
  const id = useId();
  const parsed = parseAttributes(value);
  return (
    <>
      <label className="field" htmlFor={id}>
        <span>Attributes</span>
        <textarea
          id={id}
          className="attributes-input"
          value={value}
          rows={6}
          disabled={busy}
          spellCheck={false}
          placeholder="{}"
          aria-invalid={'problem' in parsed || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {'problem' in parsed && <span className="field-error" role="alert">{parsed.problem}</span>}
      </label>
      <p className="field-hint">
        {hint ?? 'Anything the routing scripts read; the node itself reads none of it.'} Saving replaces
        every attribute with what is here, so leave in the ones to keep.
      </p>
    </>
  );
}
