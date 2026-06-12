import React, { useState, useEffect } from 'react';

export const AnimatedNumber: React.FC<{ value: string | number; className?: string }> = ({ value, className }) => {
  const [displayValue, setDisplayValue] = useState(value);
  const [prevValue, setPrevValue] = useState<string | number | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (value !== displayValue) {
      setPrevValue(displayValue);
      setDisplayValue(value);
      setKey(prev => prev + 1);
      
      const timer = setTimeout(() => {
        setPrevValue(null);
      }, 600); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [value, displayValue]);

  return (
    <span className={`number-container ${className || ''}`}>
      {prevValue !== null && (
        <span key={`exit-${key}`} className="number-scroll-item scroll-exit">
          {prevValue}
        </span>
      )}
      <span key={`enter-${key}`} className="number-scroll-item scroll-enter">
        {displayValue}
      </span>
    </span>
  );
};
