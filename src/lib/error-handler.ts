/**
 * Error Handler Utility
 * Provides structured error responses with error codes and types
 */

export enum ErrorCode {
  // Validation Errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_FIELDS = 'MISSING_FIELDS',
  INVALID_INPUT = 'INVALID_INPUT',
  
  // Authentication Errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_API_KEY = 'INVALID_API_KEY',
  
  // Rate Limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // Scraping Errors (500)
  SCRAPING_FAILED = 'SCRAPING_FAILED',
  CALENDAR_NOT_FOUND = 'CALENDAR_NOT_FOUND',
  BROWSER_ERROR = 'BROWSER_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // Concurrency Errors (503)
  QUEUE_FULL = 'QUEUE_FULL',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Timeout Errors (504)
  REQUEST_TIMEOUT = 'REQUEST_TIMEOUT',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
  
  // Generic Errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ErrorType {
  CLIENT_ERROR = 'CLIENT_ERROR',      // 4xx
  SERVER_ERROR = 'SERVER_ERROR',      // 5xx
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',    // 504
  SERVICE_ERROR = 'SERVICE_ERROR'    // 503
}

export enum SuccessCode {
  SCRAPING_SUCCESS = 'SCRAPING_SUCCESS',
  OPERATION_SUCCESS = 'OPERATION_SUCCESS',
  REQUEST_PROCESSED = 'REQUEST_PROCESSED'
}

export interface ErrorResponse {
  success: false;
  status: number;
  error: {
    code: ErrorCode;
    type: ErrorType;
    message: string;
    details?: string;
    timestamp: string;
    requestId?: string;
    metadata?: Record<string, any>;
  };
}

export interface SuccessResponse<T = any> {
  success: true;
  status: number;
  code: SuccessCode;
  data: T;
  timestamp?: string;
  requestId?: string;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

export class ErrorHandler {
  /**
   * Create a structured error response
   */
  static createError(
    code: ErrorCode,
    message: string,
    details?: string,
    metadata?: Record<string, any>,
    requestId?: string
  ): ErrorResponse {
    const type = this.getErrorType(code);
    const status = this.getStatusCode(code);
    
    return {
      success: false,
      status,
      error: {
        code,
        type,
        message,
        details,
        timestamp: new Date().toISOString(),
        requestId,
        metadata
      }
    };
  }

  /**
   * Get HTTP status code from error code
   */
  static getStatusCode(code: ErrorCode): number {
    switch (code) {
      case ErrorCode.VALIDATION_ERROR:
      case ErrorCode.MISSING_FIELDS:
      case ErrorCode.INVALID_INPUT:
        return 400;
      
      case ErrorCode.UNAUTHORIZED:
      case ErrorCode.INVALID_API_KEY:
        return 401;
      
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return 429;
      
      case ErrorCode.QUEUE_FULL:
      case ErrorCode.SERVICE_UNAVAILABLE:
        return 503;
      
      case ErrorCode.REQUEST_TIMEOUT:
      case ErrorCode.OPERATION_TIMEOUT:
        return 504;
      
      default:
        return 500;
    }
  }

  /**
   * Get HTTP status code for success responses (always 200)
   */
  static getSuccessStatusCode(): number {
    return 200;
  }

  /**
   * Get error type from error code
   */
  private static getErrorType(code: ErrorCode): ErrorType {
    if ([ErrorCode.VALIDATION_ERROR, ErrorCode.MISSING_FIELDS, ErrorCode.INVALID_INPUT, 
         ErrorCode.UNAUTHORIZED, ErrorCode.INVALID_API_KEY, ErrorCode.RATE_LIMIT_EXCEEDED].includes(code)) {
      return ErrorType.CLIENT_ERROR;
    }
    
    if ([ErrorCode.QUEUE_FULL, ErrorCode.SERVICE_UNAVAILABLE].includes(code)) {
      return ErrorType.SERVICE_ERROR;
    }
    
    if ([ErrorCode.REQUEST_TIMEOUT, ErrorCode.OPERATION_TIMEOUT].includes(code)) {
      return ErrorType.TIMEOUT_ERROR;
    }
    
    return ErrorType.SERVER_ERROR;
  }

  /**
   * Create a structured success response
   */
  static createSuccess<T>(
    code: SuccessCode,
    data: T,
    requestId?: string
  ): SuccessResponse<T> {
    return {
      success: true,
      status: this.getSuccessStatusCode(),
      code,
      data,
      timestamp: new Date().toISOString(),
      requestId
    };
  }

  /**
   * Parse error from scraper or other sources and convert to structured format
   */
  static parseError(error: any, requestId?: string): ErrorResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Check for specific error patterns
    if (errorMessage.includes('Could not find calendar')) {
      return this.createError(
        ErrorCode.CALENDAR_NOT_FOUND,
        'Calendar elements not found on the page',
        'The scraper could not locate the calendar component. This may indicate the page structure has changed or the form is not loading correctly.',
        { originalError: errorMessage },
        requestId
      );
    }
    
    if (errorMessage.includes('has been closed') || errorMessage.includes('Target page')) {
      return this.createError(
        ErrorCode.BROWSER_ERROR,
        'Browser connection lost',
        'The browser instance was closed or disconnected during scraping. This may be due to resource constraints or network issues.',
        { originalError: errorMessage },
        requestId
      );
    }
    
    if (errorMessage.includes('timeout')) {
      return this.createError(
        ErrorCode.OPERATION_TIMEOUT,
        'Scraping operation timed out',
        'The scraping operation exceeded the maximum allowed time. The target site may be slow or unresponsive.',
        { originalError: errorMessage },
        requestId
      );
    }
    
    if (errorMessage.includes('queue is full')) {
      return this.createError(
        ErrorCode.QUEUE_FULL,
        'Request queue is full',
        'The system is currently processing too many requests. Please try again later.',
        { originalError: errorMessage },
        requestId
      );
    }
    
    // Generic scraping error
    if (errorMessage.includes('Scraping') || errorMessage.includes('scrape')) {
      return this.createError(
        ErrorCode.SCRAPING_FAILED,
        'Scraping operation failed',
        errorMessage,
        { originalError: errorMessage },
        requestId
      );
    }
    
    // Default to internal error
    return this.createError(
      ErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred',
      errorMessage,
      { originalError: errorMessage },
      requestId
    );
  }
}

