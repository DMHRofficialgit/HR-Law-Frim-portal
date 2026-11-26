import type { UserRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organisationId: string | null;
  mustChangePassword: boolean;
  sessionId?: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export {};
