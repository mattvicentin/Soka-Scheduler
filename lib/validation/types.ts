/**
 * Structured validation error responses for the UI.
 * Hard constraints (errors) block actions; advisory (warnings) do not.
 */
export interface ValidationError {
  code: string;
  message: string;
  /** Optional field path for form binding */
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ValidationErrorResponse {
  error: string;
  details: {
    errors: ValidationError[];
    warnings: ValidationError[];
  };
}

export function toValidationResponse(result: ValidationResult): ValidationErrorResponse {
  return {
    error: "Validation failed",
    details: {
      errors: result.errors,
      warnings: result.warnings,
    },
  };
}
