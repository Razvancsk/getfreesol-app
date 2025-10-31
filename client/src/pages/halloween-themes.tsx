import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Ghost, Skull, Moon, Candy, Flame } from 'lucide-react';
import { useLocation } from 'wouter';

export default function HalloweenThemes() {
  const [, setLocation] = useLocation();
  const [selectedTheme, setSelectedTheme] = useState<number | null>(null);

  const themes = [
    {
      id: 1,
      name: "👻 Spooky Purple",
      description: "Dark haunted mansion with floating ghosts",
      gradient: "from-purple-950 via-violet-900 to-black",
      accentColor: "bg-purple-500",
      textColor: "text-purple-300",
      icon: Ghost,
    },
    {
      id: 2,
      name: "🎃 Pumpkin Orange",
      description: "Bright Halloween pumpkin patch vibes",
      gradient: "from-orange-900 via-orange-700 to-red-950",
      accentColor: "bg-orange-500",
      textColor: "text-orange-300",
      icon: Flame,
    },
    {
      id: 3,
      name: "🧙 Witch's Cauldron",
      description: "Mystical green bubbling magic",
      gradient: "from-emerald-950 via-green-900 to-black",
      accentColor: "bg-green-500",
      textColor: "text-green-300",
      icon: Skull,
    },
    {
      id: 4,
      name: "🌙 Moonlight",
      description: "Dark night with full moon and bats",
      gradient: "from-blue-950 via-indigo-900 to-black",
      accentColor: "bg-blue-400",
      textColor: "text-blue-300",
      icon: Moon,
    },
    {
      id: 5,
      name: "🍬 Candy Corn",
      description: "Sweet playful orange and yellow",
      gradient: "from-yellow-700 via-orange-600 to-orange-900",
      accentColor: "bg-yellow-400",
      textColor: "text-yellow-200",
      icon: Candy,
    },
  ];

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
            <CardContent className="p-6 text-center">
              <p className="text-white mb-4">
                You selected: <strong>{themes.find(t => t.id === selectedTheme)?.name}</strong>
              </p>
              <Button
                onClick={() => {
                  // TODO: Apply theme
                  alert(`Theme "${themes.find(t => t.id === selectedTheme)?.name}" selected! This will be applied to the main page.`);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Apply This Theme
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
