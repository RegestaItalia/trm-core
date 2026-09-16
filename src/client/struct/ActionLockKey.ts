/** One canonical SAP resource protected by a TRM action lock. */
export interface ActionLockKey {
    resourceType: string;
    resourceHash: string;
    resourceName: string;
}
