# Brownfield Satellite - GitHub Pages Deployment

This project is configured to be deployed to GitHub Pages.

## Manual Deployment

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Build and deploy: `npm run deploy`.

## Automated Deployment (GitHub Actions)

A GitHub Action is configured in `.github/workflows/deploy.yml`. It will automatically deploy the app to the `gh-pages` branch whenever you push to `main`.

### Required Setup:

1. **GitHub Secret**: Go to your repository settings -> Secrets and variables -> Actions.
2. Add a **New repository secret**:
   - Name: `GEMINI_API_KEY`
   - Value: Your Gemini API key.
3. **GitHub Pages Setting**: Go to Settings -> Pages.
   - Under **Build and deployment**, set **Source** to "Deploy from a branch".
   - Select the `gh-pages` branch and the `/ (root)` folder.

## Environment Variables

The app uses `process.env.GEMINI_API_KEY` which is injected at build time. Ensure this is set in your environment or GitHub Secrets for the app to function correctly after deployment.
