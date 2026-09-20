/**
 * Request header the proxy sets on every dashboard request, naming the panel
 * it is for: "/admin", "/instructor" or "/student". Server code reads it to
 * know which of a person's roles to act as (see `getCurrentUser`). The proxy
 * strips any copy a client sends.
 */
export const SECTION_HEADER = "x-sfc-section";
