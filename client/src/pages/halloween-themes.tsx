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
    return (
      <div className={`min-h-screen bg-gradient-to-b ${selectedThemeData.gradient} p-4 relative overflow-hidden`}>
        {/* Halloween decorative elements */}
        <Icon className={`absolute top-10 right-10 h-32 w-32 ${selectedThemeData.textColor} opacity-10 animate-pulse`} />
        <Icon className={`absolute bottom-20 left-10 h-24 w-24 ${selectedThemeData.textColor} opacity-10 animate-pulse`} style={{ animationDelay: '1s' }} />
        
        <div className="max-w-7xl mx-auto space-y-6 relative z-10">
          {/* Preview Header */}
          <Card className={`${selectedThemeData.cardBg} ${selectedThemeData.borderColor} backdrop-blur border-2`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => setShowPreview(false)}
                    variant="ghost"
                    size="icon"
                    className="text-white hover:text-white hover:bg-white/20"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div>
                    <CardTitle className="text-2xl text-white">Full Preview - {selectedThemeData.name}</CardTitle>
                    <CardDescription className="text-white/70">
                      This is how your entire website will look!
                    </CardDescription>
                  </div>
                </div>
                <Badge className={`${selectedThemeData.accentColor} text-white text-lg px-4 py-2`}>
                  Preview Mode
                </Badge>
              </div>
            </CardHeader>
          </Card>

          {/* Main Content Preview */}
          <Card className={`${selectedThemeData.cardBg} ${selectedThemeData.borderColor} backdrop-blur border-2`}>
            <CardHeader className="text-center space-y-4 py-12">
              <div className="flex justify-center mb-4">
                <Icon className={`h-20 w-20 ${selectedThemeData.textColor}`} />
              </div>
              <CardTitle className="text-5xl font-bold text-white">
                🎃 Get Your SOL Back! 🎃
              </CardTitle>
              <CardDescription className={`text-xl ${selectedThemeData.textColor} max-w-2xl mx-auto`}>
                Reclaim SOL from empty token accounts this Halloween season!
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pb-12">
              <div className="flex flex-col items-center gap-4">
                <Button className={`${selectedThemeData.accentColor} hover:opacity-90 text-white text-lg px-8 py-6`}>
                  🎃 Connect Wallet & Scan
                </Button>
                <p className={`text-sm ${selectedThemeData.textColor}`}>
                  Happy Halloween! Scan your wallet for free SOL
                </p>
              </div>

              {/* Stats Preview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                {[
                  { label: "Total SOL Recovered", value: "3.45 SOL", icon: "💰" },
                  { label: "Empty Accounts Found", value: "127", icon: "👻" },
                  { label: "Happy Users", value: "89", icon: "🎃" },
                ].map((stat, i) => (
                  <Card key={i} className={`${selectedThemeData.cardBg} ${selectedThemeData.borderColor} border text-center`}>
                    <CardContent className="pt-6">
                      <p className="text-3xl mb-2">{stat.icon}</p>
                      <p className="text-2xl font-bold text-white">{stat.value}</p>
                      <p className={`text-sm ${selectedThemeData.textColor} mt-1`}>{stat.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-4 justify-center">
            <Button
              onClick={() => setShowPreview(false)}
              variant="outline"
              className="border-white text-white hover:bg-white/20"
            >
              ← Back to Themes
            </Button>
            <Button
              onClick={() => {
                alert(`${selectedThemeData.name} will be applied to your website!`);
              }}
              className={`${selectedThemeData.accentColor} text-white hover:opacity-90 px-8`}
            >
              Apply This Theme
            </Button>
          </div>
        </div>
      </div>
    );
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
