/**
 * system_config keys. Use these when reading/writing config.
 */
export const CONFIG_KEYS = {
  MAX_CLASS_DURATION_MINUTES: "max_class_duration_minutes",
  ALLOWED_START_MINUTES: "allowed_start_minutes",
  BUSY_SLOT_START_HOUR: "busy_slot_start_hour",
  BUSY_SLOT_END_HOUR: "busy_slot_end_hour",
  HEATMAP_FACULTY_THRESHOLD: "heatmap_faculty_threshold",
  CROWDED_SLOT_THRESHOLD: "crowded_slot_threshold",
  /** DB value "faculty_conflict_policy" — Dean: warn vs block when scheduling into an already-crowded time period (not same-instructor overlap). */
  CROWDED_PERIOD_POLICY: "faculty_conflict_policy",
  LOAD_PERIOD: "load_period",
  INVITATION_EXPIRY_DAYS: "invitation_expiry_days",
  VERIFICATION_CODE_EXPIRY_MINUTES: "verification_code_expiry_minutes",
} as const;

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];
