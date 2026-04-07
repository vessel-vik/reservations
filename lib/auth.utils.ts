"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Multi-Tenant Identity & Security Framework
 *
 * Extracts businessId from Clerk organization context with legacy fallback.
 * This is the core security layer for tenant isolation.
 */

export interface AuthContext {
  businessId: string;
  userId: string;
  orgId?: string;
  role?: string;
}

/**
 * Get authenticated user context with business isolation
 * @returns AuthContext with businessId for tenant filtering
 * @throws Error if no valid organization context found
 */
export async function getAuthContext(): Promise<AuthContext> {
  const { userId, orgId } = await auth();

  if (!userId) {
    throw new Error("UNAUTHORIZED: No authenticated user found.");
  }

  // Primary: Extract from Clerk organization
  if (orgId) {
    return {
      businessId: orgId, // orgId becomes the businessId
      userId,
      orgId,
      role: await getUserRole(orgId, userId)
    };
  }

  // Fallback: Legacy metadata (for migration period)
  const user = await currentUser();
  const legacyBusinessId = user?.publicMetadata?.businessId as string;

  if (legacyBusinessId) {
    console.warn("Using legacy businessId from user metadata. Migrate to organizations ASAP.");
    return {
      businessId: legacyBusinessId,
      userId,
      role: "legacy" // Mark as legacy for migration tracking
    };
  }

  throw new Error("UNAUTHORIZED: No valid Organization Context identified. User must belong to an organization.");
}

/**
 * Get user's role within an organization
 * @param orgId Organization ID
 * @param userId User ID
 * @returns Role string or undefined
 */
export async function getUserRole(orgId: string, userId: string): Promise<string | undefined> {
  try {
    const client = await clerkClient();
    const membership = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      userId: [userId]
    });

    return membership.data[0]?.role;
  } catch (error) {
    console.error("Error fetching user role:", error);
    return undefined;
  }
}

/**
 * Server action wrapper for multi-tenant operations
 * Enforces businessId injection for all database operations
 */
export async function withTenantIsolation<T>(
  operation: (businessId: string, authContext: AuthContext) => Promise<T>
): Promise<T> {
  const authContext = await getAuthContext();

  try {
    return await operation(authContext.businessId, authContext);
  } catch (error) {
    console.error(`Multi-tenant operation failed for business ${authContext.businessId}:`, error);
    throw error;
  }
}

/**
 * Validate business context for API routes
 * @param businessId Business ID to validate
 * @returns Promise<boolean> if valid, throws error if invalid
 */
export async function validateBusinessContext(businessId: string): Promise<boolean> {
  if (!businessId || typeof businessId !== 'string' || businessId.length === 0) {
    throw new Error("INVALID_BUSINESS_CONTEXT: Business ID is required and must be non-empty.");
  }

  // Basic format validation (adjust based on your org ID format)
  if (!/^[a-zA-Z0-9_-]+$/.test(businessId)) {
    throw new Error("INVALID_BUSINESS_CONTEXT: Business ID contains invalid characters.");
  }

  return true;
}