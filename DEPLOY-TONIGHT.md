# Put Niko Online Tonight

You will use two GitHub repositories, two Cloudflare Pages projects, and one Supabase project.

## Final layout

- `https://nikoresidentialholdings.com` is the public customer website.
- `https://www.nikoresidentialholdings.com` may point to the same public website.
- `https://app.nikoresidentialholdings.com` is the private owner portal.
- Supabase stores private app records, quote requests, private photos, and approved public portfolio records.

## Part 1: Update Supabase

1. Sign in at Supabase and open your existing Niko project.
2. Open **SQL Editor**.
3. Select **New query**.
4. Open `app/supabase-setup.sql` from this download.
5. Copy the whole file, paste it into Supabase, and select **Run**.
6. Open **Authentication > Users** and confirm your owner user exists.
7. Open **Connect** or **Settings > API Settings**.
8. Copy the **Project URL** and **Publishable key**. Do not copy the secret or service-role key.

## Part 2: Add the safe Supabase values to both websites

1. Open `app/dist/config.js`.
2. Replace `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE` with your Project URL.
3. Replace `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE` with your Publishable key.
4. Save it.
5. Repeat the same replacements in `public-site/config.js`.

The publishable key is safe to use in browser code when the included Supabase row-level security policies are installed. Never put your database password, Supabase secret key, service-role key, GitHub token, Cloudflare token, login password, or one-time code in these files.

## Part 3: Put the private portal on GitHub

1. Open GitHub and create a **private** repository named `niko-business-app`.
2. Open the `app/dist` folder from this download.
3. Upload everything inside `dist` to the repository root. Do not upload the `dist` folder as one nested folder.
4. The root should contain `index.html`, `app.js`, `auth.js`, `portal.js`, `styles.css`, `enhancements.css`, `config.js`, `sw.js`, `manifest.webmanifest`, and `assets`.
5. Commit the upload to `main`.

## Part 4: Put the public website on GitHub

1. Create another repository named `niko-residential-website`.
2. Open the `public-site` folder from this download.
3. Upload everything inside `public-site` to the repository root.
4. Confirm `index.html`, `quote.html`, `services.html`, `projects.html`, the JavaScript files, CSS files, `config.js`, and `assets` are at the root.
5. Commit the upload to `main`.

## Part 5: Deploy the public website with Cloudflare Pages

1. Open Cloudflare **Workers & Pages**.
2. Select **Create application > Pages > Connect to Git**.
3. Select `niko-residential-website`.
4. Use production branch `main`.
5. Set framework preset to **None**.
6. Set build command to `exit 0`.
7. Set build output directory to `.`.
8. Select **Save and Deploy**.
9. Open **Custom domains** in this Pages project.
10. Add `nikoresidentialholdings.com`.
11. Add `www.nikoresidentialholdings.com` if desired.
12. Follow the displayed DNS prompt and wait for the domain to show **Active**.

## Part 6: Deploy the private portal with Cloudflare Pages

1. Create a second Pages application and connect `niko-business-app`.
2. Use production branch `main`.
3. Set framework preset to **None**.
4. Set build command to `exit 0`.
5. Set build output directory to `.`.
6. Select **Save and Deploy**.
7. Open **Custom domains** for this private Pages project.
8. Add `app.nikoresidentialholdings.com`.
9. Wait for the domain to show **Active**.

## Part 7: Finish Supabase authentication settings

1. Return to Supabase.
2. Open **Authentication > URL Configuration**.
3. Set **Site URL** to `https://app.nikoresidentialholdings.com`.
4. Add `https://app.nikoresidentialholdings.com/**` under **Redirect URLs**.
5. Add the private `.pages.dev/**` address as a temporary redirect URL until testing is complete.
6. Save.

The public website does not need a customer login. The private portal requires the owner account you created in Supabase.

## Part 8: Test the full data path

1. Open `https://nikoresidentialholdings.com/quote.html`.
2. Submit a request named `Website Test` and add one sample image.
3. Open `https://app.nikoresidentialholdings.com` and sign in.
4. Open **Quote requests** and select **Refresh**.
5. Confirm the name, description, service selection, and private image appear.
6. Select **Create job from request** and confirm the new quote opens.
7. Open **Schedule**, create an estimate visit, and copy the customer calendar link.
8. Open the link and confirm the Google Calendar and ICS buttons work.
9. Add a before and after photo to the test job.
10. Record `Public non-identifying use approved` only for this test.
11. Open **Public projects**, select both test photos, confirm the privacy review, and publish.
12. Open the public **Our Work** page and confirm the test project appears.
13. Delete the public test project, website test request, and private test job.

## Part 9: Install the private portal on iPhone

1. Open `https://app.nikoresidentialholdings.com` in Safari.
2. Tap **Share**.
3. Tap **Add to Home Screen**.
4. Name it `Niko Projects` and tap **Add**.

## If the quote form says the connection is incomplete

- Confirm both `config.js` files contain the same Project URL and publishable key.
- Confirm you ran the complete updated SQL file without errors.
- Confirm the latest GitHub commit deployed successfully in both Cloudflare Pages projects.
- Never add a secret key to fix a browser error.
