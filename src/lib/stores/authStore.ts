import { atom } from 'nanostores';
import type { CustomerAddressProfile } from '../../context/StoreContext';

export interface AstroIslandUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export const $authUser = atom<AstroIslandUser | null>(null);
export const $isAdmin = atom<boolean>(false);
export const $adminSessionId = atom<string | null>(null);
export const $customerProfile = atom<CustomerAddressProfile | null>(null);

export function setAuthUser(user: AstroIslandUser | null) {
  $authUser.set(user);
}

export function setAdminStatus(isAdmin: boolean, sessionId: string | null = null) {
  $isAdmin.set(isAdmin);
  $adminSessionId.set(sessionId);
}
