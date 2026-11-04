# 24 ESPORTS HUB

Competitive gaming, one hub. Doesn't matter what you play, just be good at it.

## Deploy on Netlify
1. Import this repository into Netlify.
2. Set the publish directory to `public` and leave the build command empty.
3. Add environment variables `ADMIN_PASSWORD` and `SESSION_SECRET` (use long random values).
4. Deploy. Netlify Functions and Blobs power the admin dashboard and persistent data.

Admin access is managed through the `/admin` page. Scores and event data are entered by staff.