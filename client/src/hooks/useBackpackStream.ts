import { useState, useEffect, useRef, useCallback } from 'react';

interface UseBackpackStreamOptions {
  enabled?: boolean;
  onMessage?: (data: any) => void;
  onError?: (error: Error) => void;
}

export function useBackpackStream<T = any>(
  endpoint: string,
  options: UseBackpackStreamOptions = {}
) {
  const { enabled = true, onMessage, onError } = options;
  const [data, setData] = useState<T | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!enabled || eventSourceRef.current) {
      return;
    }

    try {
      const es = new EventSource(endpoint);
      eventSourceRef.current = es;

      es.onopen = () => {
        console.log(`📡 Connected to ${endpoint}`);
        setIsConnected(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const parsedData = JSON.parse(event.data);
          
          if (parsedData.error) {
            const err = new Error(parsedData.error);
            setError(err);
            onError?.(err);
            return;
          }

          setData(parsedData);
          onMessage?.(parsedData);
        } catch (err) {
          console.error('Failed to parse SSE message:', err);
        }
      };

      es.onerror = (err) => {
        console.error(`❌ SSE error on ${endpoint}:`, err);
        setIsConnected(false);
        
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }

        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`🔄 Reconnecting to ${endpoint}...`);
            connect();
          }, 5000);
        }
      };

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      setError(error);
      onError?.(error);
    }
  }, [endpoint, enabled, onMessage, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      console.log(`🔌 Disconnecting from ${endpoint}`);
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, [endpoint]);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    data,
    isConnected,
    error,
    reconnect: () => {
      disconnect();
      setTimeout(connect, 100);
    },
  };
}

export function useOrderUpdates(symbol?: string) {
  const endpoint = symbol 
    ? `/api/backpack/ws/orders?symbol=${symbol}`
    : '/api/backpack/ws/orders';
  
  return useBackpackStream(endpoint);
}

export function usePositionUpdates(symbol?: string) {
  const endpoint = symbol 
    ? `/api/backpack/ws/positions?symbol=${symbol}`
    : '/api/backpack/ws/positions';
  
  return useBackpackStream(endpoint);
}

export function useRFQUpdates(symbol?: string) {
  const endpoint = symbol 
    ? `/api/backpack/ws/rfq?symbol=${symbol}`
    : '/api/backpack/ws/rfq';
  
  return useBackpackStream(endpoint);
}

export function useMarketDepth(symbol: string) {
  return useBackpackStream(`/api/backpack/ws/depth/${symbol}`);
}

export function useMarketTicker(symbol: string) {
  return useBackpackStream(`/api/backpack/ws/ticker/${symbol}`);
}
