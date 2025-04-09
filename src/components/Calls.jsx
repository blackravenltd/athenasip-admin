import { useEffect } from 'react';
import { Button } from 'react-bootstrap';
import JsSIP from 'jssip';

// Create the JsSIP WebSocket interface (using ws:// for this example)
const socket = new JsSIP.WebSocketInterface('ws://sip.athenasip.org:9500');

// Configure the UA (ensure that your SIP URI includes "sip:" as required)
const configuration = {
  sockets  : [ socket ],
  uri      : 'sip:tomweb@sip.athenasip.org',
  password : 'tomweb'
};

const target = 'sip:tom@sip.athenasip.org';

const coolPhone = new JsSIP.UA(configuration);

export default function Calls() {

  useEffect(() => { 
    coolPhone.on('connected', () => { console.log("JsSIP connected"); });
    coolPhone.on('disconnected', () => { console.log("JsSIP disconnected"); });
    coolPhone.on('registered', () => { console.log("JsSIP registered"); });
    coolPhone.on('unregistered', () => { console.log("JsSIP unregistered"); });
    coolPhone.on('registrationFailed', (e) => { console.log("JsSIP registration failed", e); });

    // Listen for new RTC sessions (calls)
    coolPhone.on('newRTCSession', (e) => {
      console.log("New RTC session");
      const session = e.session;

      // Handle various session events
      session.on('progress', () => { console.log("Call is in progress"); });
      session.on('failed', (e) => { console.log("Call failed", e); });
      session.on('ended', (e) => { console.log("Call ended", e); });
      session.on('confirmed', () => {
        console.log("Call confirmed");
        // When confirmed, attach the remote stream to the audio element.
        // For a simple implementation, we assume that the remote audio stream is on the first remote stream.
        // Note: The exact method to get the remote stream may depend on browser compatibility.
        const remoteAudio = document.getElementById('remoteAudio');
        if (remoteAudio && session.connection) {
          // For Chrome and others, getRemoteStreams() typically returns the streams.
          const remoteStreams = session.connection.getRemoteStreams();
          if (remoteStreams && remoteStreams[0]) {
            remoteAudio.srcObject = remoteStreams[0];
            // Play the audio (modern browsers require user interaction to play)
            remoteAudio.play().catch(err => console.error("Audio playback error:", err));
          }
        }
      });
    });

    coolPhone.start();
  }, []); // Empty dependency array ensures this is only set up once

  const register = () => {
    // Registration is automatic on start if the configuration is correct.
    console.log("Registering with the SIP server");
  };

  // Call button: Initiates an audio call to 'sip:tom@sip.athenasip.org'
  const call = () => {
    // Make sure the UA is started and registered before calling
    const session = coolPhone.call(target, {
      mediaConstraints: { audio: true, video: false },
      // These RTC offer constraints are common for audio calls
      rtcOfferConstraints: { offerToReceiveAudio: 1, offerToReceiveVideo: 0 }
    });
    console.log("Call initiated to", target);
  };

  return (
    <>
      <h2>Calls</h2>
      <Button onClick={register}>Register</Button>
      <Button onClick={call}>Call</Button>
      {/* Audio element to play remote audio */}
      <audio id="remoteAudio" autoPlay controls style={{ marginTop: '1rem' }} />
    </>
  );
}
