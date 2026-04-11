import { useState, useEffect } from 'react';
import { X, Star } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

export function triggerFeedbackCard(walletAddress?: string) {
  const key = walletAddress ? `feedback_shown_${walletAddress}` : 'feedback_shown_anon';
  if (localStorage.getItem(key)) return;
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('show-feedback-card', { detail: { key } }));
  }, 1000);
}

export function FeedbackWidget() {
  const [visible, setVisible] = useState(false);
  const [storageKey, setStorageKey] = useState('feedback_shown_anon');
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { publicKey } = useWalletAdapter();
  const { toast } = useToast();
  const [location] = useLocation();

  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail?.key || 'feedback_shown_anon';
      if (localStorage.getItem(key)) return;
      setStorageKey(key);
      setVisible(true);
      setSubmitted(false);
      setRating(0);
      setComment('');
    };
    window.addEventListener('show-feedback-card', handler);
    return () => window.removeEventListener('show-feedback-card', handler);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(storageKey, '1');
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/feedback', {
        rating,
        comment: comment.trim() || null,
        walletAddress: publicKey?.toString() || null,
        page: location,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      sessionStorage.setItem('feedback_shown', '1');
      setTimeout(() => setVisible(false), 2500);
    },
    onError: () => {
      toast({ title: 'Failed to send feedback', variant: 'destructive' });
    },
  });

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[200] w-[calc(100vw-2rem)] sm:w-80 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-2xl border border-purple-500/40 shadow-2xl shadow-purple-950/60 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e0b4a 0%, #0d0520 60%, #1a0840 100%)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-white font-bold text-sm tracking-wide">Quick Feedback</span>
          </div>
          <button onClick={dismiss} className="text-purple-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {submitted ? (
            <div className="text-center py-5">
              <div className="text-4xl mb-3">🙏</div>
              <p className="text-green-400 font-bold text-sm">Thanks! We appreciate it.</p>
            </div>
          ) : (
            <>
              <p className="text-purple-200/80 text-xs mb-4">How would you rate your experience?</p>

              {/* Stars */}
              <div className="flex gap-1 justify-center mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => setRating(star)}
                    className="p-0.5 transition-transform hover:scale-110 active:scale-95"
                  >
                    <Star
                      className={`w-9 h-9 transition-all duration-150 ${
                        star <= (hovered || rating)
                          ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.6)]'
                          : 'text-purple-700'
                      }`}
                    />
                  </button>
                ))}
              </div>

              {/* Comment */}
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What can we improve? (optional)"
                maxLength={400}
                rows={2}
                className="w-full text-xs px-3 py-2 rounded-xl text-white placeholder-purple-400/50 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/60 transition-all mb-3"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}
              />

              {/* Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={dismiss}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold text-purple-400 hover:text-white transition-colors"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}
                >
                  Skip
                </button>
                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={rating === 0 || submitMutation.isPending}
                  className={`flex-[2] py-2 rounded-xl text-xs font-bold transition-all ${
                    rating === 0
                      ? 'text-purple-500/50 cursor-not-allowed'
                      : 'text-white hover:brightness-110 active:scale-[0.98]'
                  }`}
                  style={rating === 0
                    ? { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }
                    : { background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', border: '1px solid rgba(167,139,250,0.4)' }
                  }
                >
                  {submitMutation.isPending ? 'Sending…' : 'Send Feedback'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
