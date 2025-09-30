# 🚀 VERCEL DEPLOYMENT GUIDE

## Quick Deploy to Vercel

1. **Connect GitHub Repository**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with GitHub
   - Click "Import Project"
   - Select: `crusher0311/mos-maintenance-mvp`

2. **Set Environment Variables**
   In your Vercel project dashboard, go to Settings → Environment Variables and add:

   ```
   MONGODB_URI=your_mongodb_connection_string
   SESSION_SECRET=your_32_character_secret_key  
   ADMIN_TOKEN=your_admin_access_token
   ```

3. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your app will be live at `https://your-project.vercel.app`

## Required Environment Variables

### Minimum Required (for basic functionality):
- `MONGODB_URI` - Your MongoDB connection string
- `SESSION_SECRET` - Random 32+ character string for sessions
- `ADMIN_TOKEN` - Token for creating admin users

### Optional (for full features):
- `OPENAI_API_KEY` - For AI-powered maintenance analysis
- `SMTP_*` variables - For email notifications
- `AUTOFLOW_*` variables - For AutoFlow integration
- `CARFAX_*` variables - For Carfax vehicle reports

## MongoDB Setup Options

### Option 1: MongoDB Atlas (Recommended)
1. Go to [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create free cluster
3. Get connection string
4. Use as `MONGODB_URI`

### Option 2: Local MongoDB
```
MONGODB_URI=mongodb://localhost:27017/mos-maintenance-mvp
```

## First Time Setup

1. Deploy the app
2. Visit your deployed URL
3. Go to `/setup` to create admin account
4. Use your `ADMIN_TOKEN` to promote users to admin

## Features Ready Out of the Box

✅ User authentication and management  
✅ Customer and vehicle management  
✅ Shop management system  
✅ Vehicle maintenance tracking  
✅ Professional admin dashboard  
✅ Responsive design  
✅ API endpoints for all operations  

## Support

If you encounter issues:
1. Check Vercel build logs
2. Verify environment variables are set
3. Ensure MongoDB is accessible
4. Check browser console for client-side errors