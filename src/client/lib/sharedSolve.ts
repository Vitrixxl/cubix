/**
 * A solve shared by its public link (go-api's shared_solves): /s/<id>, opened by anyone, signed in or not, in the
 * desktop web app's page whatever the device (boot.ts); /solve/<token> for the links made before.
 */
export const sharedSolveUrl = (origin: string, id: string) => `${origin}/s/${id}`;

/** The shared solve an address names, under a language's prefix or not; none for any other address. */
export const sharedSolveId = (pathname: string) => /^(?:\/(?:fr|es|it|de))?\/(?:s|solve)\/([\w-]+)$/.exec(pathname)?.[1];
