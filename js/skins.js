// All skin/cosmetic data
const SKINS_DATA = {
  outfits: [
    {
      id: 'default',
      name: 'Standard',
      rarity: 'common',
      unlocked: true,
      bpTier: null,
      colors: { body: '#4a90d9', head: '#f5c518', legs: '#2c5282', arms: '#4a90d9' }
    },
    {
      id: 'shadow_ops',
      name: 'Shadow Ops',
      rarity: 'epic',
      unlocked: false,
      bpTier: 5,
      colors: { body: '#1a1a2e', head: '#2d2d44', legs: '#0f0f1e', arms: '#1a1a2e' }
    },
    {
      id: 'aurora',
      name: 'Aurora',
      rarity: 'legendary',
      unlocked: false,
      bpTier: 15,
      colors: { body: '#6d28d9', head: '#a78bfa', legs: '#4c1d95', arms: '#7c3aed' }
    },
    {
      id: 'blaze',
      name: 'Blaze',
      rarity: 'rare',
      unlocked: false,
      bpTier: 10,
      colors: { body: '#dc2626', head: '#fca5a5', legs: '#7f1d1d', arms: '#ef4444' }
    },
    {
      id: 'arctic',
      name: 'Arktis',
      rarity: 'uncommon',
      unlocked: false,
      bpTier: 3,
      colors: { body: '#93c5fd', head: '#f0f9ff', legs: '#bfdbfe', arms: '#93c5fd' }
    },
    {
      id: 'camo',
      name: 'Tarnung',
      rarity: 'uncommon',
      unlocked: false,
      bpTier: 7,
      colors: { body: '#365314', head: '#a3e635', legs: '#1a2e05', arms: '#4d7c0f' }
    },
    {
      id: 'neon',
      name: 'Neon Licht',
      rarity: 'epic',
      unlocked: false,
      bpTier: 20,
      colors: { body: '#0e7490', head: '#22d3ee', legs: '#083344', arms: '#06b6d4' }
    },
    {
      id: 'golden',
      name: 'Gold König',
      rarity: 'legendary',
      unlocked: false,
      bpTier: 25,
      colors: { body: '#b45309', head: '#fbbf24', legs: '#78350f', arms: '#d97706' }
    }
  ],
  pickaxes: [
    {
      id: 'default_pick',
      name: 'Standard Hacke',
      rarity: 'common',
      unlocked: true,
      bpTier: null,
      icon: '⛏️'
    },
    {
      id: 'thunder_pick',
      name: 'Donnerschlag',
      rarity: 'rare',
      unlocked: false,
      bpTier: 8,
      icon: '⚡'
    },
    {
      id: 'shadow_blade',
      name: 'Schattenklinge',
      rarity: 'epic',
      unlocked: false,
      bpTier: 18,
      icon: '⚔️'
    },
    {
      id: 'rainbow_scythe',
      name: 'Regenbogen-Sense',
      rarity: 'legendary',
      unlocked: false,
      bpTier: 30,
      icon: '🌈'
    }
  ],
  gliders: [
    {
      id: 'default_glider',
      name: 'Standard Gleiter',
      rarity: 'common',
      unlocked: true,
      bpTier: null,
      icon: '🪂'
    },
    {
      id: 'storm_wing',
      name: 'Sturmflügel',
      rarity: 'rare',
      unlocked: false,
      bpTier: 12,
      icon: '🦅'
    },
    {
      id: 'nebula',
      name: 'Nebula',
      rarity: 'epic',
      unlocked: false,
      bpTier: 22,
      icon: '🌌'
    }
  ]
};

const RARITY_COLORS = {
  common:    '#b4b4b4',
  uncommon:  '#00c864',
  rare:      '#0078d4',
  epic:      '#8b5cf6',
  legendary: '#f5c518',
};

const RARITY_NAMES = {
  common:    'GEWÖHNLICH',
  uncommon:  'UNGEWÖHNLICH',
  rare:      'SELTEN',
  epic:      'EPISCH',
  legendary: 'LEGENDÄR',
};

// Draw a player character on a canvas
function drawSkinOnCanvas(ctx, skin, x, y, scale = 1, animate = false) {
  const c = skin ? skin.colors : SKINS_DATA.outfits[0].colors;
  const t = animate ? Date.now() / 400 : 0;
  const bobY = animate ? Math.sin(t) * 2 : 0;

  ctx.save();
  ctx.translate(x, y + bobY);
  ctx.scale(scale, scale);

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 30, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Legs
  ctx.fillStyle = c.legs;
  ctx.fillRect(-8, 10, 7, 18);
  ctx.fillRect(1, 10, 7, 18);

  // Boots
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-9, 24, 8, 5);
  ctx.fillRect(1, 24, 8, 5);

  // Body
  ctx.fillStyle = c.body;
  ctx.fillRect(-9, -8, 18, 20);

  // Arms
  ctx.fillStyle = c.arms;
  ctx.fillRect(-15, -7, 6, 14);
  ctx.fillRect(9, -7, 6, 14);

  // Head
  ctx.fillStyle = c.head;
  ctx.beginPath();
  ctx.roundRect(-9, -22, 18, 16, 4);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(-6, -19, 5, 5);
  ctx.fillRect(1, -19, 5, 5);
  ctx.fillStyle = '#000';
  ctx.fillRect(-5, -18, 3, 3);
  ctx.fillRect(2, -18, 3, 3);

  // Helmet/hat accent
  ctx.fillStyle = c.body;
  ctx.fillRect(-9, -24, 18, 4);
  ctx.beginPath();
  ctx.arc(0, -24, 4, Math.PI, 0);
  ctx.fill();

  ctx.restore();
}
