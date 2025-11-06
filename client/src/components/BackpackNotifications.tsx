import { useEffect, useState } from 'react';
import { useOrderUpdates, usePositionUpdates } from '@/hooks/useBackpackStream';
import { useToast } from '@/hooks/use-toast';
import { Bell, TrendingUp, TrendingDown, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface Notification {
  id: string;
  type: 'order' | 'position';
  event: string;
  symbol: string;
  message: string;
  timestamp: number;
  data: any;
}

export function BackpackNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  const { data: orderData } = useOrderUpdates();
  const { data: positionData } = usePositionUpdates();

  useEffect(() => {
    if (!orderData) return;

    const notification: Notification = {
      id: `order-${orderData.i}-${orderData.E}`,
      type: 'order',
      event: orderData.e,
      symbol: orderData.s,
      message: formatOrderMessage(orderData),
      timestamp: orderData.E,
      data: orderData,
    };

    setNotifications(prev => [notification, ...prev].slice(0, 50));

    if (['orderFill', 'orderAccepted', 'orderCancelled'].includes(orderData.e)) {
      toast({
        title: getOrderEventTitle(orderData.e),
        description: notification.message,
        variant: orderData.e === 'orderFill' ? 'default' : 'default',
      });
    }
  }, [orderData, toast]);

  useEffect(() => {
    if (!positionData) return;

    const notification: Notification = {
      id: `position-${positionData.i}-${positionData.T || Date.now()}`,
      type: 'position',
      event: positionData.e || 'positionUpdate',
      symbol: positionData.s,
      message: formatPositionMessage(positionData),
      timestamp: positionData.T || Date.now(),
      data: positionData,
    };

    setNotifications(prev => [notification, ...prev].slice(0, 50));

    if (positionData.e) {
      toast({
        title: getPositionEventTitle(positionData.e),
        description: notification.message,
      });
    }
  }, [positionData, toast]);

  const unreadCount = notifications.filter(n => 
    Date.now() - (n.timestamp / 1000) < 60000 // timestamp is in microseconds, convert to milliseconds
  ).length;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="relative bg-purple-600 hover:bg-purple-700 text-white rounded-full p-4 shadow-lg transition-all"
          data-testid="button-notifications-toggle"
        >
          <Bell className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {isExpanded && (
        <Card className="w-96 max-h-[600px] bg-gray-900 border-purple-500/20 shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Bell className="w-5 h-5 text-purple-400" />
              Live Updates
            </CardTitle>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-white"
              data-testid="button-notifications-close"
            >
              ×
            </button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No notifications yet</p>
                  <p className="text-sm mt-1">Live updates will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-purple-500/10">
                  {notifications.map((notification, index) => (
                    <div
                      key={notification.id}
                      className="p-4 hover:bg-purple-900/20 transition-colors"
                      data-testid={`notification-${notification.type}-${index}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {getNotificationIcon(notification)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant={notification.type === 'order' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {notification.symbol}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {formatTimestamp(notification.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300">{notification.message}</p>
                          {notification.type === 'order' && notification.data.l && (
                            <p className="text-xs text-gray-500 mt-1">
                              Filled: {notification.data.l} @ {notification.data.L}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatOrderMessage(order: any): string {
  const side = order.S === 'Bid' ? 'Buy' : 'Sell';
  const type = order.o;
  
  switch (order.e) {
    case 'orderAccepted':
      return `${side} ${type} order accepted for ${order.q || order.Q} ${order.s}`;
    case 'orderFill':
      return `${side} order filled: ${order.l} ${order.s} @ ${order.L}`;
    case 'orderCancelled':
      return `${side} order cancelled for ${order.s}`;
    case 'orderExpired':
      return `${side} order expired for ${order.s}`;
    case 'orderModified':
      return `${side} order modified for ${order.s}`;
    default:
      return `Order ${order.e} for ${order.s}`;
  }
}

function formatPositionMessage(position: any): string {
  const isLong = position.q > 0;
  const direction = isLong ? 'Long' : 'Short';
  
  switch (position.e) {
    case 'positionOpened':
      return `${direction} position opened: ${Math.abs(position.q)} ${position.s}`;
    case 'positionClosed':
      return `${direction} position closed: ${position.s}`;
    case 'positionAdjusted':
      return `${direction} position adjusted: ${Math.abs(position.q)} ${position.s}`;
    default:
      return `Position update for ${position.s}`;
  }
}

function getOrderEventTitle(event: string): string {
  switch (event) {
    case 'orderAccepted': return 'Order Accepted';
    case 'orderFill': return 'Order Filled';
    case 'orderCancelled': return 'Order Cancelled';
    case 'orderExpired': return 'Order Expired';
    case 'orderModified': return 'Order Modified';
    default: return 'Order Update';
  }
}

function getPositionEventTitle(event: string): string {
  switch (event) {
    case 'positionOpened': return 'Position Opened';
    case 'positionClosed': return 'Position Closed';
    case 'positionAdjusted': return 'Position Adjusted';
    default: return 'Position Update';
  }
}

function getNotificationIcon(notification: Notification) {
  if (notification.type === 'order') {
    switch (notification.event) {
      case 'orderAccepted':
        return <CheckCircle className="w-5 h-5 text-blue-400" />;
      case 'orderFill':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'orderCancelled':
      case 'orderExpired':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
    }
  } else {
    const isLong = notification.data.q > 0;
    return isLong 
      ? <TrendingUp className="w-5 h-5 text-green-400" />
      : <TrendingDown className="w-5 h-5 text-red-400" />;
  }
}

function formatTimestamp(microseconds: number): string {
  const date = new Date(microseconds / 1000); // Convert microseconds to milliseconds
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  
  return date.toLocaleTimeString();
}
