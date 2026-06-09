export interface ValidationErrors {
  [field: string]: string;
}

export interface RouteCardInput {
  title: string;
  origin: string;
  destination: string;
}

/**
 * Validate route card input fields.
 * Returns an object of field-level errors. Empty object means valid.
 */
export function validateRouteCard(input: RouteCardInput): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.title.trim()) {
    errors.title = 'Title is required';
  }

  if (!input.origin.trim()) {
    errors.origin = 'Origin is required';
  }

  if (!input.destination.trim()) {
    errors.destination = 'Destination is required';
  }

  if (
    input.origin.trim() &&
    input.destination.trim() &&
    input.origin.trim().toLowerCase() === input.destination.trim().toLowerCase()
  ) {
    errors.destination = 'Destination must be different from origin';
  }

  return errors;
}

/**
 * Check if validation result has any errors.
 */
export function hasErrors(errors: ValidationErrors): boolean {
  return Object.keys(errors).length > 0;
}

export interface AlertScheduleInput {
  title: string;
  departureTime: string;
  days: number[];
  oneTimeDate?: string;
}

/**
 * Validate alert schedule input fields.
 * Returns an object of field-level errors. Empty object means valid.
 */
export function validateAlertSchedule(input: AlertScheduleInput): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.title.trim()) {
    errors.title = 'Title is required';
  }

  if (!input.departureTime.trim()) {
    errors.departureTime = 'Departure time is required';
  } else {
    // Validate HH:mm format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(input.departureTime.trim())) {
      errors.departureTime = 'Departure time must be in HH:mm format';
    }
  }

  // Either days (recurring) or oneTimeDate (one-time) must be provided
  const hasDays = input.days && input.days.length > 0;
  const hasOneTimeDate = input.oneTimeDate && input.oneTimeDate.trim().length > 0;

  if (!hasDays && !hasOneTimeDate) {
    errors.days = 'Select at least one day or provide a one-time date';
  }

  // Validate days are within valid range (0-6)
  if (hasDays) {
    const invalidDays = input.days.filter((d) => d < 0 || d > 6);
    if (invalidDays.length > 0) {
      errors.days = 'Days must be between 0 (Sunday) and 6 (Saturday)';
    }
  }

  // Validate oneTimeDate format if provided
  if (hasOneTimeDate) {
    const date = new Date(input.oneTimeDate!);
    if (isNaN(date.getTime())) {
      errors.oneTimeDate = 'One-time date must be a valid date';
    }
  }

  return errors;
}
