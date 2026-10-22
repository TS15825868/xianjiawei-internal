import pg from 'npm:pg@8.16.3';
import {createReceiptHandler} from '../../../n8n-runtime/social-receipt-handler.mjs';
// No service-role key, administrator connection, send method or automatic retry.
Deno.serve(createReceiptHandler({
 readEnv:(name:string)=>Deno.env.get(name),
 createPool:(options:pg.PoolConfig)=>new pg.Pool(options)
}));
