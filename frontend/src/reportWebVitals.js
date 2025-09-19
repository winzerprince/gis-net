/**
 * ===================================================
 * WEB VITALS REPORTING
 * Performance Monitoring Utilities
 * ===================================================
 */

const reportWebVitals = (onPerfEntry) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({ onCLS, onFID, onFCP, onLCP, onTTFB }) => {
      onCLS(onPerfEntry);
      onFID(onPerfEntry);
      onFCP(onPerfEntry);
      onLCP(onPerfEntry);
      onTTFB(onPerfEntry);
    }).catch(() => {
      // Gracefully handle web-vitals import errors
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.warn('Web Vitals library could not be loaded');
      }
    });
  }
};

export default reportWebVitals;
