import { useState } from 'react';
import { MessageSquarePlus, X, Star } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useWalletAdapter } from '@/hooks/useWalletAdapter';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { publicKey } = useWalletAdapter();
  const { toast } = useToast();
  const [location] = useLocation();

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
      setTimeout(() => {
        setOpen(false);
        setRating(0);
        setComment('');
        setSubmitted(false);
      }, 2000);
    },
    onError: () => {
      toast({ title: 'Failed to send feedback', variant: 'destructive' });
    },
  });

  const handleOpen = () => {
    setOpen(true);
    setSubmitted(false);
    setRating(0);
    setComment('');
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className={`fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[200] flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold px-4 py-2.5 rounded-full shadow-lg shadow-purple-900/40 transition-all hover:scale-105 active:scale-95 ${open ? 'hidden' : ''}`}
        title="Send feedback"
      >
        <MessageSquarePlus className="w-4 h-4" />
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:w-80 bg-[#1a1035] border border-purple-500/30 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 mb-24 sm:mb-0 sm:mr-2">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-base">Share your feedback</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-4">
                <div className="text-3xl mb-2">🙏</div>
                <p className="text-green-400 font-bold">Thanks for your feedback!</p>
                <p className="text-gray-400 text-sm mt-1">We appreciate it.</p>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-gray-300 text-sm mb-2">How would you rate your experience?</p>
                  <div className="flex gap-1 justify-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onMouseEnter={() => setHovered(star)}
                        onMouseLeave={() => setHovered(0)}
                        onClick={() => setRating(star)}
                        className="p-1 transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-8 h-8 transition-colors ${
                            star <= (hovered || rating)
                              ? 'text-yellow-400 fill-yellow-400'
                              : 'text-gray-600'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-gray-300 text-sm mb-2">What can we improve? <span className="text-gray-500">(optional)</span></p>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Tell us what you think..."
                    maxLength={500}
                    rows={3}
                    className="w-full bg-purple-950/50 border border-purple-500/30 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 resize-none focus:outline-none focus:border-purple-400 transition-colors"
                  />
                </div>

                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={rating === 0 || submitMutation.isPending}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${
                    rating === 0
                      ? 'bg-purple-800/40 text-gray-500 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-500 text-white active:scale-[0.98]'
                  }`}
                >
                  {submitMutation.isPending ? 'Sending...' : 'Send Feedback'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
