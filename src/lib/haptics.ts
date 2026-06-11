/**
 * Haptic feedback utility for mobile web.
 * Uses the Vibration API where available.
 */

export function hapticLight() {
  if ('vibrate' in navigator) {
    navigator.vibrate(10);
  }
}

export function hapticMedium() {
  if ('vibrate' in navigator) {
    navigator.vibrate(20);
  }
}

export function hapticHeavy() {
  if ('vibrate' in navigator) {
    navigator.vibrate([30, 10, 30]);
  }
}

export function hapticSuccess() {
  if ('vibrate' in navigator) {
    navigator.vibrate([10, 50, 20]);
  }
}

export function hapticError() {
  if ('vibrate' in navigator) {
    navigator.vibrate([40, 30, 40, 30, 40]);
  }
}
