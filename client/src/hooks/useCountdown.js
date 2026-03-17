import { useState, useEffect, useCallback } from "react";

/**
 * Live countdown hook that ticks every second toward a target datetime.
 *
 * @param {Date|string|null} targetDate - Future datetime to count down to
 * @returns {{ days: number, hours: number, minutes: number, seconds: number, isPast: boolean }}
 */
export const useCountdown = (targetDate) => {
  const computeTimeLeft = useCallback(() => {
    if (!targetDate) return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      isPast: false,
    };
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = useState(computeTimeLeft);

  useEffect(() => {
    if (!targetDate) return;
    const id = setInterval(() => setTimeLeft(computeTimeLeft()), 1000);
    return () => clearInterval(id);
  }, [targetDate, computeTimeLeft]);

  return timeLeft;
};
