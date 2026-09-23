# Connect and Install Niko Project Manager Tonight

Keep this private app in its own GitHub repository. Do not combine it with the public company website.

## Before using it for a paying customer

1. Confirm that **Niko Residential Holdings** is available and properly registered for use by **Amr and Nhi LLC** as an Ohio trade or fictitious name, if required for your situation.
2. Add the LLC's business address under **Settings** so it prints on customer documents.
3. Have an Ohio attorney review the customer and freelancer terms, required cancellation forms, lien notices, insurance, licensing, permits, worker classification, and any work performed outside Ohio.

## 1. Prepare Supabase

1. Sign in to Supabase and open your Niko project.
2. Open **SQL Editor** and select **New query**.
3. Open `supabase-setup.sql` from this download.
4. Copy the complete SQL file into the query box.
5. Select **Run**. This creates the private app state, private job files, private website requests, request-photo storage, customer-approved public projects, portfolio storage, and all required row-level security rules.

## 2. Create your owner login

1. Open **Authentication > Users** in Supabase.
2. Select **Add user**.
3. Create or invite the one owner email address that should access the private system.
4. Complete the invitation or set a strong password.
5. Use that same owner login on your iPhone and computer. This version keeps one private cloud workspace per login and has no public sign-up page.

## 3. Add the safe browser keys

1. Open the Supabase project **Connect** panel or **Settings > API Settings**.
2. Copy the **Project URL**.
3. Copy the **Publishable key**. A legacy anon key also works, but the publishable key is preferred.
4. Open `dist/config.js` in a text editor.
5. Replace `PASTE_YOUR_SUPABASE_PROJECT_URL_HERE` with the Project URL.
6. Replace `PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE` with the Publishable key.
7. Save `config.js`.
8. Put the same Project URL and publishable key in the public website’s `config.js` file. The two websites then use the same protected Supabase project.

Never put a secret key, service-role key, database password, account password, or access token in `config.js` or GitHub.

## 4. Upload the app to GitHub

1. Create a private repository named `niko-business-app`.
2. Open the `dist` folder in this download.
3. Upload **everything inside `dist`** to the repository root, including the `assets` folder.
4. Commit the upload to `main`.

The repository root should show `index.html`, `app.js`, `auth.js`, `portal.js`, `config.js`, `styles.css`, `enhancements.css`, `sw.js`, `manifest.webmanifest`, and `assets`.

## 5. Deploy with Cloudflare Pages

1. Open Cloudflare **Workers & Pages**.
2. Select **Create application > Pages > Connect to Git**.
3. Choose the private `niko-business-app` repository.
4. Set the production branch to `main`.
5. Set the framework preset to `None`.
6. Set the build command to `exit 0`.
7. Set the build output directory to `.` because the site files are at the repository root.
8. Select **Save and Deploy** and open the new `.pages.dev` address.
9. Under **Custom domains**, add `app.nikoresidentialholdings.com`.

## 6. Add the Cloudflare address to Supabase

1. Copy both the complete `.pages.dev` address and `https://app.nikoresidentialholdings.com`.
2. Open **Authentication > URL Configuration** in Supabase.
3. Set **Site URL** to that address.
4. Add both addresses under **Redirect URLs**. Add `/**` to each address if Supabase asks for wildcard paths.
5. Save.

## 7. Test before entering real customer information

1. Sign in through the new login page.
2. Create a job for `Test Customer`.
3. Add a $1,250 customer line item.
4. Choose **Freelancer / independent contractor**.
5. Enter a private freelancer price of $1,000.
6. Confirm the app shows a $250 gross difference before company expenses.
7. Print the quote and confirm the $1,000 freelancer price does not appear.
8. Print the freelancer agreement and confirm only the $1,000 private compensation appears.
9. Confirm the first printed page shows the logo, stage, document number, customer, address, and date.
10. Delete the test quote from the dashboard.
11. Sign in from another device and confirm cloud syncing.
12. Download a backup from **Settings**.
13. Submit a test request from the public website, then open **Quote requests** and confirm it appears with its optional photo.
14. Create an estimate appointment under **Schedule**, open the customer link, and download the calendar file.
15. Record public photo approval on the test job, publish selected before and after photos, and confirm they appear on the public Our Work page.

## 8. Install on iPhone

1. Open the Cloudflare app address in Safari.
2. Tap **Share > Add to Home Screen**.
3. Name it `Niko Projects` and tap **Add**.

## 9. Print or save a PDF

1. Open **Documents** in the app and select the saved job.
2. Tap the quote, contract, receipt, or private freelancer print button.
3. On iPhone, choose a printer in the iOS print sheet. To save a PDF instead, expand the print preview and use **Share > Save to Files**.
4. On a computer, choose a printer or **Save as PDF**.
5. Keep the freelancer agreement private. Its compensation is intentionally separate from every customer document.

## Separate public website

The public website has a separate download. Put it in a second repository named `niko-residential-website` and connect it to a second Cloudflare Pages project using `nikoresidentialholdings.com`. It connects to the same Supabase project for protected quote intake and customer-approved gallery records. Row-level security prevents public visitors from reading requests, private jobs, pricing, addresses, or documents.
