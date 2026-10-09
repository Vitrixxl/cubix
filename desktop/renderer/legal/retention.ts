/** How long the server keeps its logs, in days: go-api/activity.go's constants, which a test keeps in step. */
export const RETENTION = { log: 30, traffic: 90, activity: 400 } as const;
