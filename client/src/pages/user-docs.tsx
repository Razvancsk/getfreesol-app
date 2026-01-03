import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function UserDocs() {
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    setLocation('/?tab=docs');
  }, [setLocation]);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      <div className="text-white text-lg">Loading documentation...</div>
    </div>
  );
}
