import handlePostgresRequest from '../server/postgres/api.mjs';
import { createVercelHandler } from '../server/vercel-route.mjs';
export default createVercelHandler(handlePostgresRequest);
