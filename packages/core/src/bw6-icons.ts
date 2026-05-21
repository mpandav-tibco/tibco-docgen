export interface BW6IconRegistry {
  /**
   * Look up an icon by Java class name reference.
   * @param ref    Full Java class name, e.g. "com.tibco.bw.palette.jdbc.runtime.JDBCQueryActivity"
   * @param name   Optional activity display name used as a secondary lookup when the class is a
   *               generic wrapper (e.g. "ActivityExtensionActivity").
   * @param typeId Optional activityTypeID, e.g. "bw.jdbc.JDBCQuery" — used to look up real PNG icons.
   */
  get(ref: string, name?: string, typeId?: string): string | undefined;
  /** Fallback icon for unrecognized activity types (shown instead of text abbreviation) */
  unknownIcon?: string;
  size: number;
}
