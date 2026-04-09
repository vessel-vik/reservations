import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher(['/pos(.*)', '/admin(.*)']);

export default clerkMiddleware(async (auth, req) => {
  // Skip authentication for .well-known files (needed for domain verification)
  if (req.nextUrl.pathname.includes('/.well-known/')) {
    return;
  }

  if (isProtectedRoute(req)) {
      await auth.protect();

      // Additional organization context validation for POS routes
      const { orgId } = await auth();
      if (!orgId) {
        // Allow access but log warning - fallback to legacy metadata will handle
        console.warn(`POS route accessed without organization context: ${req.nextUrl.pathname}`);
      }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
