/** The exact text an agent signs with the address its ENS name resolves to (shared by server and browser). */
export const licenseMessage = (ensName: string, capsuleId: string, purpose: string) =>
  `HEN license request\nagent: ${ensName}\ncapsule: ${capsuleId}\npurpose: ${purpose}`;
