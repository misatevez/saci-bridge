import { randomUUID } from 'node:crypto';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';

interface PedidoRequest {
  idDoc: string;
  emissionDate: string;
  identificationType: string;
  identification: string;
  socialReason: string;
  address: string;
  email: string;
  phone: string;
  details: Record<string, any>[] | Record<string, any>;
}

interface ClienteRequest {
  identificationType: string;
  identification: string;
  socialReason: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface Producto {
  sku: string;
  nombre: string;
  precio: string;
  cantidad: string;
  categoria: string;
  estado: boolean;
}

interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

const DEMO_PRODUCTOS: Record<string, Producto> = {
  pro001: {
    sku: 'pro001',
    nombre: 'Producto demo',
    precio: '100.00',
    cantidad: '10',
    categoria: '001',
    estado: true,
  },
  '23456': {
    sku: '23456',
    nombre: 'Producto ejemplo',
    precio: '250.50',
    cantidad: '25',
    categoria: '002',
    estado: true,
  },
  'demo-1': {
    sku: 'demo-1',
    nombre: 'Demo item',
    precio: '50.00',
    cantidad: '100',
    categoria: '001',
    estado: true,
  },
};

// Middleware para validar Bearer token
function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    const err: ApiError = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing authorization header',
      },
    };
    logger.warn({ path: req.path, method: req.method }, 'Missing auth header');
    return res.status(401).json(err);
  }

  const token = authHeader.replace('Bearer ', '');
  logger.info({ path: req.path, method: req.method, token: token.substring(0, 20) + '...' }, 'Auth token received');
  next();
}

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      customProps: (req) => ({ request_id: req.id }),
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  // Health endpoint (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      version: '0.1.0-mock',
      ts: new Date().toISOString(),
    });
  });

  // All other routes require auth
  app.use(authMiddleware);

  // POST /pedidos
  app.post('/pedidos', (req: Request<{}, any, PedidoRequest>, res: Response) => {
    const body = req.body;

    // Accept details as both object and array
    if (!body.details || (typeof body.details !== 'object')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing or invalid details',
        },
      });
    }

    const idPedido = randomUUID();
    const receivedAt = new Date().toISOString();

    logger.info(
      {
        path: req.path,
        method: req.method,
        idDoc: body.idDoc,
        email: body.email,
        detailsType: Array.isArray(body.details) ? 'array' : 'object',
      },
      'Pedido received',
    );

    res.status(200).json({
      ok: true,
      idPedido,
      received_at: receivedAt,
    });
  });

  // GET /productos/{sku}
  app.get('/productos/:sku', (req: Request<{ sku: string }>, res: Response<Producto | ApiError>) => {
    const { sku } = req.params;

    const producto = DEMO_PRODUCTOS[sku];

    if (!producto) {
      logger.info({ path: req.path, method: req.method, sku }, 'Producto not found');
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'SKU no encontrado',
        },
      });
    }

    logger.info({ path: req.path, method: req.method, sku }, 'Producto found');
    res.status(200).json(producto);
  });

  // GET /productos (paginated)
  app.get('/productos', (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const productos = Object.values(DEMO_PRODUCTOS);
    const paginated = productos.slice(offset, offset + limit);

    logger.info(
      { path: req.path, method: req.method, limit, offset, total: productos.length },
      'Productos list',
    );

    res.status(200).json({
      items: paginated,
      limit,
      offset,
      total: productos.length,
    });
  });

  // POST /clientes
  app.post('/clientes', (req: Request<{}, any, ClienteRequest>, res: Response) => {
    const body = req.body;

    if (!body.identificationType || !body.identification || !body.socialReason) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Missing required fields',
        },
      });
    }

    const idCliente = randomUUID();

    logger.info(
      {
        path: req.path,
        method: req.method,
        identification: body.identification,
        socialReason: body.socialReason,
      },
      'Cliente created',
    );

    res.status(200).json({
      ok: true,
      idCliente,
    });
  });

  return app;
}
