/**
 * Vercel Serverless Function — wraps the Express app.
 * All /api/* requests are routed here via vercel.json rewrites.
 */
import app from '../server/index.js';

export default app;
