import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import { ChiliPiperScraper } from './lib/scraper';
import { SecurityMiddleware } from './lib/security-middleware';
import { getCalendarContextPool } from './lib/calendar-context-pool';

// Load environment variables
dotenv.config();

const app = Fastify({ logger: false });
const PORT = process.env.PORT || 3000;

// Middleware
app.register(fastifyCors, { origin: true });

const security = new SecurityMiddleware();
// Scraper-only server: admin/auth removed

// Health check endpoint
app.get('/api/health', async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    return reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Chili Piper Slot Scraper (Fastify)',
      debug: {
        node_version: process.version,
        request_method: req.method,
        request_url: (req as any).url
      }
    });
  } catch (error) {
    return reply.status(500).send({
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// (Removed test-simple endpoints)

// Get slots endpoint
app.post('/api/get-slots', async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    console.log('🔍 Get-Slots API Debug - Request received');
    const body: any = (req as any).body || {};
      console.log(`✅ Parsed and validated data:`, body);
      
      const startTime = Date.now();
    const headers = (req as any).headers || {};
    const clientIP = headers['x-forwarded-for']?.toString().split(',')[0] || 
                    headers['x-real-ip']?.toString() || 
                    (req as any).ip ||
                    'unknown';
    const userAgent = headers['user-agent'] || 'unknown';

    // Auth
    const authHeader = headers['authorization'] || '';
    const authResult = security.validateApiKey(authHeader);
    if (!authResult.valid) {
      return reply.status(401).send({ success: false, error: 'Unauthorized', message: 'Invalid or missing API key' });
    }
      
      console.log('🔍 Starting scraping process...');
      
    const scraper = new ChiliPiperScraper();
    const result = await scraper.scrapeSlots(
      body.first_name,
      body.last_name,
      body.email,
      body.phone
    );
      
    if (!result.success) {
        console.log(`❌ Scraping failed: ${result.error}`);
      return reply.status(500).send({ success: false, error: 'Scraping failed', message: result.error });
    }
      
      console.log('✅ Scraping completed successfully');
      console.log(`📊 Result: ${result.data?.total_days} days, ${result.data?.total_slots} slots`);
      
    return reply.send(result);
  } catch (error) {
    console.error('❌ API error:', error);
    return reply.status(500).send({ success: false, error: 'Internal Server Error', message: 'An unexpected error occurred' });
  }
});

// Get slots stream endpoint (removed in Fastify migration for now)
/*
app.post('/api/get-slots-stream', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Get-Slots Streaming API - Request received');
    
    // Check authentication
    const authHeader = req.headers.authorization || '';
    const authResult = security.validateApiKey(authHeader);
    
    if (!authResult.valid) {
      console.log('❌ Authentication failed');
      security.addSecurityHeaders(res);
      security.configureCORS(res);
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or missing API key. Please provide a valid Bearer token.',
        usage: {
          example: 'Authorization: Bearer your-api-key-here'
        }
      });
      return;
    }
    
    console.log('✅ Authentication successful');
    
    const body = req.body;
    console.log(`✅ Parsed data:`, body);
    
    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'email', 'phone'];
    const missingFields = requiredFields.filter(field => !body[field]);
    
    if (missingFields.length > 0) {
      console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
      security.addSecurityHeaders(res);
      security.configureCORS(res);
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: `The following fields are required: ${missingFields.join(', ')}`
      });
      return;
    }
    
    console.log('🔍 Starting streaming scraping process...');
    
    // Set up SSE headers
    security.addSecurityHeaders(res);
    security.configureCORS(res);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const encoder = new TextEncoder();
    
    // Send initial response
    const initialResponse = {
      success: true,
      streaming: true,
      message: 'Starting slot collection...',
      data: {
        total_slots: 0,
        total_days: 0,
        slots: [],
        note: 'Streaming results as they become available'
      }
    };
    
    res.write(`data: ${JSON.stringify(initialResponse)}\n\n`);
    
    // Run the scraping
    const scraper = new ChiliPiperScraper();
    const result = await scraper.scrapeSlots(
      body.first_name,
      body.last_name,
      body.email,
      body.phone
    );
    
    if (!result.success) {
      console.log(`❌ Scraping failed: ${result.error}`);
      const errorResponse = {
        success: false,
        error: 'Scraping failed',
        message: result.error
      };
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
      return;
    }
    
    // Stream the results in chunks
    const allSlots = result.data?.slots || [];
    const chunkSize = 20;
    
    for (let i = 0; i < allSlots.length; i += chunkSize) {
      const chunk = allSlots.slice(i, i + chunkSize);
      const progress = Math.round((i + chunk.length) / allSlots.length * 100);
      
      const streamingResponse = {
        success: true,
        streaming: true,
        message: `Streaming slots... ${progress}% complete`,
        data: {
          total_slots: allSlots.length,
          total_days: result.data?.total_days || 0,
          slots: chunk,
          note: `Streaming: ${i + chunk.length}/${allSlots.length} slots (${progress}%)`
        }
      };
      
      res.write(`data: ${JSON.stringify(streamingResponse)}\n\n`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Send final completion response
    const finalResponse = {
      success: true,
      streaming: false,
      message: 'Slot collection completed',
      data: result.data
    };
    
    res.write(`data: ${JSON.stringify(finalResponse)}\n\n`);
    res.end();
    
  } catch (error) {
    console.error('❌ API error:', error);
    security.addSecurityHeaders(res);
    security.configureCORS(res);
    
    if (error instanceof SyntaxError) {
      res.status(400).json({
        success: false,
        error: 'Invalid JSON',
        message: 'Request body must be valid JSON'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});
*/

/*app.post('/api/get-slots-per-day-stream',
  security.secureRequestMiddleware({
    requireAuth: true,
    rateLimit: { maxRequests: 30, windowMs: 15 * 60 * 1000 },
    inputSchema: ValidationSchemas.scrapeRequest,
    allowedMethods: ['POST']
  }),
  async (req: Request, res: Response) => {
    try {
      console.log('🔍 Get-Slots Per-Day Streaming API - Request received');
      
      const body = req.body;
      console.log(`✅ Parsed and validated data:`, body);
      
      const clientIP = req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                      req.headers['x-real-ip']?.toString() || 
                      req.ip ||
                      'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      console.log('🔍 Starting per-day streaming scraping process...');
      
      // Set up SSE headers
      security.addSecurityHeaders(res);
      security.configureCORS(res);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      
      const encoder = new TextEncoder();
      
      // Send initial response
      const initialResponse = {
        success: true,
        streaming: true,
        message: "Starting slot collection...",
        data: {
          total_slots: 0,
          total_days: 0,
          slots: [],
          note: "Streaming results per day as they become available"
        }
      };
      
      res.write(`data: ${JSON.stringify(initialResponse)}\n\n`);
      
      try {
        const scraper = new ChiliPiperScraper();
        
        // Define the streaming callback
        const streamingCallback = (dayData: { date: string; slots: string[]; totalDays: number; totalSlots: number }) => {
          const daySlots = dayData.slots.map(slot => ({
            date: dayData.date,
            time: slot,
            gmt: "GMT-05:00 America/Chicago (CDT)"
          }));
          
          const streamingResponse = {
            success: true,
            streaming: true,
            message: `Found ${dayData.slots.length} slots for ${dayData.date}`,
            data: {
              total_slots: dayData.totalSlots,
              total_days: dayData.totalDays,
              slots: daySlots,
              note: `Streaming: ${dayData.totalDays}/7 days collected`
            }
          };
          
          res.write(`data: ${JSON.stringify(streamingResponse)}\n\n`);
        };
        
        // Run the scraping with streaming callback
        const result = await scraper.scrapeSlots(
          body.first_name,
          body.last_name,
          body.email,
          body.phone,
          streamingCallback
        );
        
        if (!result.success) {
          console.log(`❌ Scraping failed: ${result.error}`);
          security.logSecurityEvent('STREAMING_SCRAPING_FAILED', {
            endpoint: '/api/get-slots-per-day-stream',
            userAgent,
            error: result.error
          }, clientIP);
          
          const errorResponse = {
            success: false,
            streaming: false,
            error: 'Scraping failed',
            message: result.error || 'Unknown scraping error'
          };
          res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
          res.end();
          return;
        }
        
        // Final response
        const finalResponse = {
          success: true,
          streaming: false,
          message: "Slot collection completed",
          data: {
            total_slots: result.data?.total_slots || 0,
            total_days: result.data?.total_days || 0,
            note: `Found ${result.data?.total_days || 0} days with ${result.data?.total_slots || 0} total booking slots`,
            slots: result.data?.slots || []
          }
        };
        res.write(`data: ${JSON.stringify(finalResponse)}\n\n`);
        res.end();
        
        // Log successful streaming
        security.logSecurityEvent('STREAMING_SUCCESS', {
          endpoint: '/api/get-slots-per-day-stream',
          userAgent,
          daysFound: result.data?.total_days,
          slotsFound: result.data?.total_slots
        }, clientIP);
        
      } catch (error) {
        console.error('❌ Streaming API error during scraping:', error);
        security.logSecurityEvent('STREAMING_ERROR', {
          endpoint: '/api/get-slots-per-day-stream',
          userAgent,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, clientIP);
        
        const errorResponse = {
          success: false,
          streaming: false,
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        };
        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
        res.end();
      }
    } catch (error) {
      console.error('❌ API error:', error);
      security.logSecurityEvent('STREAMING_API_ERROR', {
        endpoint: '/api/get-slots-per-day-stream',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, req.headers['x-forwarded-for']?.toString() || 'unknown');
      
      res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    }
  }
);*/

/*app.post('/api/get-slots-mock', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Get-Slots API Debug (No Playwright) - Request received');
    
    const authHeader = req.headers.authorization || '';
    const authResult = security.validateApiKey(authHeader);
    
    if (!authResult.valid) {
        console.log('❌ Authentication failed');
      security.addSecurityHeaders(res);
      security.configureCORS(res);
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid or missing API key. Please provide a valid Bearer token.',
        usage: {
          example: 'Authorization: Bearer your-api-key-here'
        }
      });
      return;
    }
    
    console.log('✅ Authentication successful');
    
    const body = req.body;
    console.log(`✅ Parsed data:`, body);
    
    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'email', 'phone'];
    const missingFields = requiredFields.filter(field => !body[field]);
    
    if (missingFields.length > 0) {
      console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
      security.addSecurityHeaders(res);
      security.configureCORS(res);
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: `The following fields are required: ${missingFields.join(', ')}`
      });
      return;
    }
    
    console.log('🔍 Simulating scraping process...');
    
    // Mock data
    const mockSlots = [
      { date: '2025-10-28', time: '8:00 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-28', time: '8:35 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-28', time: '9:00 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-29', time: '8:00 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-29', time: '8:35 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-30', time: '9:00 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' }
    ];
    
    const result = {
      success: true,
      data: {
        total_slots: mockSlots.length,
        total_days: 3,
        note: 'Mock data - Playwright not available in serverless environment',
        slots: mockSlots
      }
    };
    
    console.log('✅ Mock scraping completed successfully');
    
    security.addSecurityHeaders(res);
    security.configureCORS(res);
    res.json(result);
    
  } catch (error) {
    console.error('❌ API error:', error);
    security.addSecurityHeaders(res);
    security.configureCORS(res);
    
    if (error instanceof SyntaxError) {
      res.status(400).json({
        success: false,
        error: 'Invalid JSON',
        message: 'Request body must be valid JSON'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});*/

/*app.post('/api/admin/secure', async (req: Request, res: Response) => {
  try {
    const clientIP = req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                    req.headers['x-real-ip']?.toString() || 
                    req.ip ||
                    'unknown';
    
    // Check rate limiting
    if (!checkAdminRateLimit(clientIP)) {
      security.addSecurityHeaders(res);
      security.configureCORS(res);
      res.status(429).json({ 
        success: false, error: 'Too many login attempts. Please try again later.' 
      });
      return;
    }

    const { action, username, password, ...data } = req.body;

    if (action === 'login') {
      console.log('🔍 Login attempt:', { username, password: password ? 'PROVIDED' : 'MISSING', adminUsername: ADMIN_USERNAME });
      
      if (username !== ADMIN_USERNAME) {
        console.log('❌ Username mismatch:', { provided: username, expected: ADMIN_USERNAME });
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
        return;
      }

      console.log('✅ Username matches, checking password (hardcoded override)...');
      const isValidPassword = password === HARDCODED_ADMIN_PASSWORD;
      console.log('🔐 Password check result (hardcoded):', isValidPassword);

      if (!isValidPassword) {
        console.log('❌ Password mismatch');
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
        return;
      }

      // Generate admin token
      const adminToken = jwt.sign(
        { 
          role: 'admin', 
          username: ADMIN_USERNAME,
          timestamp: Date.now() 
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Reset rate limit on successful login
      try { adminRateLimitMap.delete(clientIP); } catch {}
      console.log(`Admin login successful from IP: ${clientIP}`);

      security.addSecurityHeaders(res);
      security.configureCORS(res);
      res.json({
        success: true,
        adminToken,
        message: 'Login successful'
      });
      return;
    }

    // Validate admin token for other actions
    if (!validateAdminToken(req)) {
      security.addSecurityHeaders(res);
      security.configureCORS(res);
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return;
    }

    const { action: apiAction } = req.body;

    switch (apiAction) {
      case 'create':
        const newKey = apiKeyManager.createApiKey(data.name, data.customKey);
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.json({
          success: true,
          apiKey: {
            ...newKey,
            key: newKey.key.substring(0, 20) + '...'
          },
          message: 'API key created successfully'
        });
        break;

      case 'list':
        const keys = apiKeyManager.getAllApiKeys();
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.json({
          success: true,
          apiKeys: keys.map((key: any) => ({
            ...key,
            key: key.key.substring(0, 20) + '...'
          }))
        });
        break;

      case 'update':
        const updatedKey = apiKeyManager.updateApiKey(data.id, data.updates);
        if (!updatedKey) {
          security.addSecurityHeaders(res);
          security.configureCORS(res);
          res.status(404).json({
            success: false,
            error: 'API key not found or invalid updates'
          });
          return;
        }
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.json({
          success: true,
          apiKey: {
            ...updatedKey,
            key: updatedKey.key.substring(0, 20) + '...'
          },
          message: 'API key updated successfully'
        });
        break;

      case 'delete':
        const deleted = apiKeyManager.deleteApiKey(data.id);
        if (!deleted) {
          security.addSecurityHeaders(res);
          security.configureCORS(res);
          res.status(404).json({
            success: false,
            error: 'API key not found'
          });
          return;
        }
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.json({
          success: true,
          message: 'API key deleted successfully'
        });
        break;

      case 'stats':
        const stats = apiKeyManager.getUsageStats();
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.json({
          success: true,
          stats
        });
        break;

      case 'get-full-key':
        const fullKey = apiKeyManager.getApiKeyById(data.id);
        if (!fullKey) {
          security.addSecurityHeaders(res);
          security.configureCORS(res);
          res.status(404).json({
            success: false,
            error: 'API key not found'
          });
          return;
        }
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.json({
          success: true,
          fullKey: fullKey.key
        });
        break;

      default:
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }

  } catch (error) {
    console.error('Admin API Error:', error);
    security.addSecurityHeaders(res);
    security.configureCORS(res);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

app.get('/api/admin/secure', (req: Request, res: Response) => {
  try {
    if (!validateAdminToken(req)) {
      security.addSecurityHeaders(res);
      security.configureCORS(res);
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
      return;
    }

    const action = req.query.action as string;

    switch (action) {
      case 'list':
        const keys = apiKeyManager.getAllApiKeys();
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.json({
          success: true,
          apiKeys: keys.map((key: any) => ({
            ...key,
            key: key.key.substring(0, 20) + '...'
          }))
        });
        break;

      case 'stats':
        const stats = apiKeyManager.getUsageStats();
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.json({
          success: true,
          stats
        });
        break;

      default:
        security.addSecurityHeaders(res);
        security.configureCORS(res);
        res.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }

  } catch (error) {
    console.error('Admin API Error:', error);
    security.addSecurityHeaders(res);
    security.configureCORS(res);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});*/

/* Fastify handles CORS via plugin */

// Start server
app.listen({ port: Number(PORT), host: '0.0.0.0' }).then(() => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  // Warm calendar context in background with generic details
  try {
    const formUrl = process.env.CHILI_PIPER_FORM_URL || "https://cincpro.chilipiper.com/concierge-router/link/lp-request-a-demo-agent-advice";
    const pool = getCalendarContextPool(formUrl);
    pool.warmUpOnce('Guest','User','guest@example.com','5551234567');
    console.log('🔥 Warming calendar context in background');
  } catch (e) {}
}).catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});

