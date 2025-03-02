import React, { useEffect, useRef } from 'react';
import { useAppState } from '../hooks';

export default function HistoryNavigator({ children }) {
  const containerRef = useRef(null);
  const [ appState, setAppState ] = useAppState();

  useEffect(() => {
    const handleClick = (event) => {
      let target = event.target;
      while (target && target !== containerRef.current) {
        if (target.tagName && target.tagName.toLowerCase() === 'a') {
          const href = target.getAttribute('href');
          const targetAttr = target.getAttribute('target');
          if (href && href.startsWith('/') && !targetAttr) {
            event.preventDefault();
            // Update the browser history using pushState
            window.history.pushState({}, '', href);
            setAppState({ route: href })
          }
          break;
        }
        target = target.parentElement;
      }
    };

    const container = containerRef.current;
    container && container.addEventListener('click', handleClick);

    // Clean up the event listener on unmount
    return () => {
      container && container.removeEventListener('click', handleClick);
    };
  }, [ setAppState ]);

  return <div style={{ width: '100%', height: '100%' }} ref={containerRef}>{children}</div>;
};
