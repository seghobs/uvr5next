import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('uvr_favorites');
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const syncFavorites = useCallback(async () => {
    try {
      const serverFavs = await api.getFavorites();
      if (Array.isArray(serverFavs) && serverFavs.length > 0) {
        setFavorites(serverFavs);
        try {
          localStorage.setItem('uvr_favorites', JSON.stringify(serverFavs));
        } catch {}
      }
    } catch (e) {
      console.error('Failed to sync favorites with backend:', e);
    }
  }, []);

  useEffect(() => {
    syncFavorites();
  }, [syncFavorites]);

  const toggleFavorite = useCallback(async (modelName: string): Promise<boolean> => {
    if (!modelName) return false;
    const isFav = favorites.includes(modelName);
    
    // Instant optimistic update
    const updated = isFav 
      ? favorites.filter(m => m !== modelName)
      : [modelName, ...favorites];

    setFavorites(updated);
    try {
      localStorage.setItem('uvr_favorites', JSON.stringify(updated));
    } catch {}

    try {
      const res = await api.toggleFavorite(modelName);
      if (res && Array.isArray(res.favorites)) {
        setFavorites(res.favorites);
        try {
          localStorage.setItem('uvr_favorites', JSON.stringify(res.favorites));
        } catch {}
      }
      return !isFav;
    } catch (e) {
      console.error('Error toggling favorite on server:', e);
      return !isFav;
    }
  }, [favorites]);

  const isFavorite = useCallback((modelName: string): boolean => {
    return favorites.includes(modelName);
  }, [favorites]);

  const getSortedModels = useCallback((models: string[] = [], search: string = ''): string[] => {
    const q = search.toLowerCase().trim();
    const filtered = models.filter(m => !q || m.toLowerCase().includes(q));

    return filtered.sort((a, b) => {
      const aFav = isFavorite(a) ? 1 : 0;
      const bFav = isFavorite(b) ? 1 : 0;
      if (aFav !== bFav) {
        return bFav - aFav; // Favorites at the top
      }
      return 0;
    });
  }, [isFavorite]);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    getSortedModels,
    syncFavorites,
  };
}
