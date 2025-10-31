import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Ghost, Skull, Moon, Candy, Flame, Eye } from 'lucide-react';
import { useLocation } from 'wouter';

export default function HalloweenThemes() {
  const [, setLocation] = useLocation();
  const [selectedTheme, setSelectedTheme] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const themes = [
    {
      id: 1,
      name: "👻 Spooky Purple",
      description: "Dark haunted mansion with floating ghosts",
      gradient: "from-purple-950 via-violet-900 to-black",
      accentColor: "bg-purple-500",
      textColor: "text-purple-300",
      cardBg: "bg-purple-900/30",
      borderColor: "border-purple-600",
      icon: Ghost,
    },
    {
      id: 2,
      name: "🎃 Pumpkin Orange",
      description: "Bright Halloween pumpkin patch vibes",
      gradient: "from-orange-900 via-orange-700 to-red-950",
      accentColor: "bg-orange-500",
      textColor: "text-orange-300",
      cardBg: "bg-orange-900/30",
      borderColor: "border-orange-600",
      icon: Flame,
    },
    {
      id: 3,
      name: "🧙 Witch's Cauldron",
      description: "Mystical green bubbling magic",
      gradient: "from-emerald-950 via-green-900 to-black",
      accentColor: "bg-green-500",
      textColor: "text-green-300",
      cardBg: "bg-green-900/30",
      borderColor: "border-green-600",
      icon: Skull,
    },
    {
      id: 4,
      name: "🌙 Moonlight",
      description: "Dark night with full moon and bats",
      gradient: "from-blue-950 via-indigo-900 to-black",
      accentColor: "bg-blue-400",
      textColor: "text-blue-300",
      cardBg: "bg-blue-900/30",
      borderColor: "border-blue-600",
      icon: Moon,
    },
    {
      id: 5,
      name: "🍬 Candy Corn",
      description: "Sweet playful orange and yellow",
      gradient: "from-yellow-700 via-orange-600 to-orange-900",
      accentColor: "bg-yellow-400",
      textColor: "text-yellow-200",
      cardBg: "bg-orange-900/30",
      borderColor: "border-yellow-600",
      icon: Candy,
    },
  ];

  const selectedThemeData = themes.find(t => t.id === selectedTheme);

  if (showPreview && selectedThemeData) {
    const Icon = selectedThemeData.icon;
    
    // Different layouts for each theme
    if (selectedThemeData.id === 1) {
      // Haunted Mansion - Spooky Purple
      return (
        <div className={`min-h-screen bg-gradient-to-b ${selectedThemeData.gradient} p-4 relative overflow-hidden`}>
          {/* Cobwebs in corners */}
          <div className="absolute top-0 left-0 w-64 h-64 opacity-20">
            <svg viewBox="0 0 200 200" className="text-purple-300">
              <path d="M0,0 L100,100 L0,200 M0,0 L200,0 L100,100 M100,100 L200,200" stroke="currentColor" fill="none" strokeWidth="2"/>
              <circle cx="100" cy="100" r="3" fill="currentColor"/>
            </svg>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 opacity-20 transform scale-x-[-1]">
            <svg viewBox="0 0 200 200" className="text-purple-300">
              <path d="M0,0 L100,100 L0,200 M0,0 L200,0 L100,100 M100,100 L200,200" stroke="currentColor" fill="none" strokeWidth="2"/>
            </svg>
          </div>
          
          {/* Floating ghosts */}
          <Ghost className="absolute top-20 right-1/4 h-16 w-16 text-purple-400 opacity-30 animate-bounce" style={{animationDuration: '3s'}} />
          <Ghost className="absolute top-40 left-1/3 h-12 w-12 text-purple-300 opacity-20 animate-bounce" style={{animationDuration: '4s', animationDelay: '1s'}} />
          
          <div className="max-w-5xl mx-auto space-y-8 relative z-10">
            <Button onClick={() => setShowPreview(false)} variant="ghost" className="text-purple-200 hover:text-white mb-4">
              ← Back
            </Button>
            
            {/* Gothic mansion style header */}
            <div className="text-center border-8 border-purple-800 bg-purple-950/80 p-12 rounded-none relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-purple-950 px-4">
                <Ghost className="h-12 w-12 text-purple-400" />
              </div>
              <h1 className="text-6xl font-serif text-purple-100 mb-4" style={{textShadow: '3px 3px 0 #000'}}>
                HAUNTED SOL RECOVERY
              </h1>
              <p className="text-purple-300 text-xl italic">Enter if you dare... reclaim your cursed SOL</p>
              <Button className="mt-8 bg-purple-600 hover:bg-purple-700 text-white px-12 py-6 text-xl border-4 border-purple-900">
                👻 ENTER THE MANSION
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-purple-900/50 border-4 border-purple-700 p-6 text-center">
                <p className="text-4xl mb-2">⚰️</p>
                <p className="text-3xl font-bold text-white">666</p>
                <p className="text-purple-300">Haunted Accounts</p>
              </div>
              <div className="bg-purple-900/50 border-4 border-purple-700 p-6 text-center">
                <p className="text-4xl mb-2">🕷️</p>
                <p className="text-3xl font-bold text-white">13.13</p>
                <p className="text-purple-300">SOL Exorcised</p>
              </div>
              <div className="bg-purple-900/50 border-4 border-purple-700 p-6 text-center">
                <p className="text-4xl mb-2">🦇</p>
                <p className="text-3xl font-bold text-white">99</p>
                <p className="text-purple-300">Brave Souls</p>
              </div>
            </div>
            
            <Button onClick={() => alert('Haunted Mansion theme selected!')} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-6 text-lg">
              CLAIM THIS HAUNTED THEME
            </Button>
          </div>
        </div>
      );
    }
    
    if (selectedThemeData.id === 2) {
      // Pumpkin Patch - Orange
      return (
        <div className={`min-h-screen bg-gradient-to-b ${selectedThemeData.gradient} p-4 relative overflow-hidden`}>
          {/* Pumpkin decorations */}
          <div className="absolute bottom-0 left-0 right-0 h-32 opacity-30">
            <div className="flex justify-around items-end h-full">
              <div className="text-7xl">🎃</div>
              <div className="text-9xl">🎃</div>
              <div className="text-7xl">🎃</div>
              <div className="text-8xl">🎃</div>
              <div className="text-7xl">🎃</div>
            </div>
          </div>
          
          <div className="max-w-5xl mx-auto space-y-8 relative z-10">
            <Button onClick={() => setShowPreview(false)} variant="ghost" className="text-orange-200 hover:text-white mb-4">
              ← Back
            </Button>
            
            {/* Carved pumpkin style */}
            <div className="relative">
              <div className="text-center bg-orange-600 rounded-full p-16 border-8 border-orange-900 shadow-2xl">
                <div className="text-8xl mb-4">🎃</div>
                <h1 className="text-5xl font-black text-orange-100 mb-4">
                  PUMPKIN PATCH<br/>SOL HARVEST
                </h1>
                <p className="text-orange-200 text-xl mb-6">Pick your pumpkins, claim your SOL!</p>
                <Button className="bg-orange-800 hover:bg-orange-900 text-white px-12 py-8 text-2xl rounded-full">
                  🎃 START HARVEST
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-6">
              {['🎃 3.45 SOL\nHarvested', '🎃 127\nPumpkins', '🎃 89\nFarmers'].map((stat, i) => (
                <div key={i} className="bg-orange-700/80 rounded-3xl p-8 text-center border-4 border-orange-900">
                  <p className="text-2xl font-bold text-white whitespace-pre-line">{stat}</p>
                </div>
              ))}
            </div>
            
            <Button onClick={() => alert('Pumpkin Patch theme selected!')} className="w-full bg-orange-600 hover:bg-orange-700 text-white py-6 text-lg rounded-full">
              PICK THIS PUMPKIN THEME
            </Button>
          </div>
        </div>
      );
    }
    
    if (selectedThemeData.id === 3) {
      // Witch's Cauldron - Green
      return (
        <div className={`min-h-screen bg-gradient-to-b ${selectedThemeData.gradient} p-4 relative overflow-hidden`}>
          {/* Bubbling effect */}
          <div className="absolute bottom-0 left-0 right-0 h-96 opacity-20">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute bottom-0 w-4 h-4 bg-green-400 rounded-full animate-ping"
                style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${2 + Math.random() * 2}s`
                }}
              />
            ))}
          </div>
          
          <div className="max-w-5xl mx-auto space-y-8 relative z-10">
            <Button onClick={() => setShowPreview(false)} variant="ghost" className="text-green-200 hover:text-white mb-4">
              ← Back
            </Button>
            
            {/* Cauldron design */}
            <div className="text-center">
              <div className="inline-block bg-green-900/80 rounded-t-full rounded-b-3xl p-12 border-8 border-green-600 relative">
                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2">
                  <Skull className="h-16 w-16 text-green-400" />
                </div>
                <div className="text-6xl mb-4 animate-pulse">🧙</div>
                <h1 className="text-5xl font-black text-green-100 mb-4">
                  WITCH'S BREW<br/>SOL POTION
                </h1>
                <p className="text-green-300 text-xl mb-6 italic">Stir the cauldron, extract your SOL...</p>
                <Button className="bg-green-600 hover:bg-green-700 text-white px-12 py-8 text-2xl">
                  🧪 BREW POTION
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-6">
              {[{icon: '🔮', label: 'Crystal Ball', value: '3.45 SOL'}, {icon: '📜', label: 'Spells Cast', value: '127'}, {icon: '🧹', label: 'Witches', value: '89'}].map((item, i) => (
                <div key={i} className="bg-gradient-to-b from-green-900 to-green-950 rounded-lg p-6 text-center border-2 border-green-500 shadow-lg shadow-green-500/50">
                  <p className="text-4xl mb-2">{item.icon}</p>
                  <p className="text-2xl font-bold text-green-100">{item.value}</p>
                  <p className="text-green-400 text-sm">{item.label}</p>
                </div>
              ))}
            </div>
            
            <Button onClick={() => alert('Witch Cauldron theme selected!')} className="w-full bg-green-600 hover:bg-green-700 text-white py-6 text-lg">
              CLAIM THIS MAGICAL THEME
            </Button>
          </div>
        </div>
      );
    }
    
    if (selectedThemeData.id === 4) {
      // Moonlight - Blue
      return (
        <div className={`min-h-screen bg-gradient-to-b ${selectedThemeData.gradient} p-4 relative overflow-hidden`}>
          {/* Moon */}
          <div className="absolute top-20 right-20 w-48 h-48 bg-blue-100 rounded-full shadow-2xl shadow-blue-400/50 opacity-80" />
          
          {/* Flying bats */}
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute text-4xl opacity-50 animate-bounce"
              style={{
                top: `${20 + Math.random() * 40}%`,
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${i * 0.5}s`,
                animationDuration: '3s'
              }}
            >
              🦇
            </div>
          ))}
          
          <div className="max-w-5xl mx-auto space-y-8 relative z-10">
            <Button onClick={() => setShowPreview(false)} variant="ghost" className="text-blue-200 hover:text-white mb-4">
              ← Back
            </Button>
            
            {/* Night sky design */}
            <div className="text-center relative">
              <div className="bg-blue-950/60 backdrop-blur-md rounded-3xl p-16 border border-blue-500 shadow-2xl shadow-blue-500/30">
                <Moon className="h-20 w-20 text-blue-300 mx-auto mb-6 animate-pulse" />
                <h1 className="text-6xl font-black text-blue-100 mb-4">
                  MOONLIT SOL HUNT
                </h1>
                <p className="text-blue-300 text-2xl mb-8">Under the full moon, your SOL awakens...</p>
                <Button className="bg-blue-500 hover:bg-blue-600 text-white px-16 py-8 text-2xl rounded-full shadow-lg shadow-blue-500/50">
                  🌙 NIGHT HUNT
                </Button>
              </div>
            </div>
            
            <div className="flex justify-center gap-8">
              {[{icon: '🌙', value: '3.45', label: 'Moon SOL'}, {icon: '⭐', value: '127', label: 'Stars'}, {icon: '🦇', value: '89', label: 'Night Owls'}].map((item, i) => (
                <div key={i} className="bg-blue-900/40 backdrop-blur rounded-2xl p-8 text-center border border-blue-500 min-w-[150px]">
                  <p className="text-5xl mb-3">{item.icon}</p>
                  <p className="text-3xl font-bold text-blue-100">{item.value}</p>
                  <p className="text-blue-400">{item.label}</p>
                </div>
              ))}
            </div>
            
            <Button onClick={() => alert('Moonlight theme selected!')} className="w-full bg-blue-500 hover:bg-blue-600 text-white py-6 text-lg rounded-full">
              CLAIM THIS MOONLIGHT THEME
            </Button>
          </div>
        </div>
      );
    }
    
    if (selectedThemeData.id === 5) {
      // Candy Corn - Yellow/Orange
      return (
        <div className={`min-h-screen bg-gradient-to-b ${selectedThemeData.gradient} p-4 relative overflow-hidden`}>
          {/* Candy scattered */}
          <div className="absolute inset-0 opacity-20">
            {[...Array(15)].map((_, i) => (
              <div
                key={i}
                className="absolute text-4xl"
                style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                  transform: `rotate(${Math.random() * 360}deg)`
                }}
              >
                🍬
              </div>
            ))}
          </div>
          
          <div className="max-w-5xl mx-auto space-y-8 relative z-10">
            <Button onClick={() => setShowPreview(false)} variant="ghost" className="text-yellow-200 hover:text-white mb-4">
              ← Back
            </Button>
            
            {/* Candy bag design */}
            <div className="text-center">
              <div className="inline-block bg-gradient-to-b from-yellow-500 via-orange-500 to-orange-700 rounded-3xl p-12 border-8 border-yellow-600 shadow-2xl transform rotate-2">
                <Candy className="h-20 w-20 text-white mx-auto mb-6" />
                <h1 className="text-6xl font-black text-white mb-4 transform -rotate-2">
                  TRICK OR TREAT<br/>SOL CANDY!
                </h1>
                <p className="text-yellow-100 text-2xl mb-8">Fill your bag with sweet SOL rewards!</p>
                <Button className="bg-yellow-600 hover:bg-yellow-700 text-white px-16 py-8 text-2xl rounded-full transform -rotate-1">
                  🍭 COLLECT CANDY
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-6">
              {[{candy: '🍬', value: '3.45 SOL'}, {candy: '🍭', value: '127 Treats'}, {candy: '🍫', value: '89 Kids'}].map((item, i) => (
                <div key={i} className="bg-gradient-to-br from-yellow-400 to-orange-600 rounded-2xl p-8 text-center border-4 border-yellow-700 transform hover:scale-105 transition">
                  <p className="text-6xl mb-3">{item.candy}</p>
                  <p className="text-2xl font-bold text-white">{item.value}</p>
                </div>
              ))}
            </div>
            
            <Button onClick={() => alert('Candy Corn theme selected!')} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-6 text-lg rounded-full">
              GRAB THIS SWEET THEME
            </Button>
          </div>
        </div>
      );
    }
    
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card className="bg-gray-800/50 border-gray-700 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setLocation('/')}
                variant="ghost"
                size="icon"
                className="text-gray-300 hover:text-white hover:bg-gray-700"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <CardTitle className="text-2xl text-white">🎃 Halloween Theme Selector</CardTitle>
                <CardDescription className="text-gray-300">
                  Pick your favorite Halloween design for the app!
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Theme Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {themes.map((theme) => {
            const Icon = theme.icon;
            return (
              <Card
                key={theme.id}
                className={`relative overflow-hidden cursor-pointer transition-all ${
                  selectedTheme === theme.id
                    ? 'ring-4 ring-white scale-105'
                    : 'hover:scale-102'
                }`}
                onClick={() => setSelectedTheme(theme.id)}
              >
                {/* Preview Background */}
                <div className={`h-48 bg-gradient-to-br ${theme.gradient} p-6 relative`}>
                  <Icon className={`h-16 w-16 ${theme.textColor} opacity-50 absolute top-4 right-4`} />
                  <div className="absolute bottom-4 left-4">
                    <h3 className="text-2xl font-bold text-white mb-2">Get Your SOL Back!</h3>
                    <Button className={`${theme.accentColor} text-white hover:opacity-90`}>
                      Claim SOL
                    </Button>
                  </div>
                  {selectedTheme === theme.id && (
                    <Badge className="absolute top-4 left-4 bg-white text-black">
                      ✓ Selected
                    </Badge>
                  )}
                </div>

                {/* Theme Info */}
                <CardContent className="p-4 bg-gray-800 border-t border-gray-700">
                  <h4 className="text-lg font-semibold text-white mb-1">{theme.name}</h4>
                  <p className="text-sm text-gray-400">{theme.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Apply Button */}
        {selectedTheme && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6 text-center space-y-4">
              <p className="text-white mb-4">
                You selected: <strong>{themes.find(t => t.id === selectedTheme)?.name}</strong>
              </p>
              <div className="flex gap-4 justify-center">
                <Button
                  onClick={() => setShowPreview(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Full Page
                </Button>
                <Button
                  onClick={() => {
                    alert(`Theme "${themes.find(t => t.id === selectedTheme)?.name}" will be applied to the main page!`);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Apply This Theme
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
