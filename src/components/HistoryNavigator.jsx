import React, { useEffect, useRef } from 'react';
import { useAppState } from '../hooks';

export default function HistoryNavigator({ children }) {
  const containerRef = useRef(null);
  const [ appState, setAppState ] = useAppState();

  // Catch initial naviagte
  useEffect(() => {
    const path = window.location.pathname;
    setAppState({ route: window.location.pathname })
  }, []);

  // Catch Navigate in page
  useEffect(() => {
    const handleClick = (event) => {
      let target = event.target;
      while (target && target !== containerRef.current) {
        if (target.tagName && target.tagName.toLowerCase() === 'a') {
          const href = target.getAttribute('href');
          const targetAttr = target.getAttribute('target');
          if (href && href.startsWith('/') && !targetAttr) {
            event.preventDefault();
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

  // Catch navigate by browser back/forward button
  useEffect(()=> {
    const handlePopState = (event) => {
      setAppState({ route: window.location.pathname })
    }
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  })

  return <div style={{ width: '100%', height: '100%' }} ref={containerRef}>{children}</div>;
};
