# Security policy

## Reporting a vulnerability

If you find a security vulnerability in WonderChat, please report it privately. Do not open a public GitHub issue.

**Email:** saisrujanseelam@gmail.com

Include:
- A description of the vulnerability
- Steps to reproduce it
- The potential impact
- A suggested fix, if you have one

I'll acknowledge receipt within 48 hours and provide an estimated timeline for a fix.

## What counts as a security issue

- Authentication or authorization bypass
- SQL injection, XSS, or other injection attacks
- Prompt injection that leaks system prompts or tenant data
- Cross-tenant data access
- API key exposure or insecure storage
- Rate limiting bypass
- Anything that lets an attacker access data they shouldn't

## What doesn't count

- Denial of service through excessive API calls (that's what rate limiting is for)
- Issues that require physical access to the server
- Social engineering attacks
- Vulnerabilities in dependencies (report those upstream, but let me know too)

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x (current) | Yes |

## Recognition

If you report a valid vulnerability, I'll credit you in the changelog and README (unless you prefer to stay anonymous).
