import { router } from "expo-router";
import { View, Text, SafeAreaView, TouchableOpacity, StatusBar, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect, useMemo, useCallback } from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ACTIVITY_DISTANCE_OPTIONS,
  ACTIVITY_PRICE_FILTER_OPTIONS,
  ACTIVITY_TIME_FILTER_OPTIONS,
  DEFAULT_ACTIVITY_RADIUS,
  loadUserPreference,
  normaliseActivityFilterPreferences,
  saveUserPreference,
  resolvePriceKeyFromRange,
  resolvePriceRangeForKey,
  resolveTimeKeyFromValues,
  resolveTimeValuesFromKey,
  type ActivityFilterPreferences,
  type ActivityPriceFilterKey,
  type ActivityTimeFilterKey,
  defaultTier3Index,
  getTier3Ids,
  trackTaxonomyFiltersApplied,
  trackTaxonomyToggle,
  type ActivityTier3WithAncestors,
} from "@dowhat/shared";

import { supabase } from "../lib/supabase";
import TaxonomyCategoryPicker from "../components/TaxonomyCategoryPicker";

export default function FilterScreen() {
  const [priceFilter, setPriceFilter] = useState<ActivityPriceFilterKey>("all");
  const [distanceFilter, setDistanceFilter] = useState<number>(DEFAULT_ACTIVITY_RADIUS);
  const [timeFilter, setTimeFilter] = useState<ActivityTimeFilterKey>("any");
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const priceOptions = ACTIVITY_PRICE_FILTER_OPTIONS;
  const distanceOptions = ACTIVITY_DISTANCE_OPTIONS;
  const timeOptions = ACTIVITY_TIME_FILTER_OPTIONS;

  const ACTIVITY_LOCAL_KEY = "activity_filters:v1";
  const taxonomyIdSet = useMemo(() => new Set(getTier3Ids()), []);
  const taxonomyIndex = useMemo(() => {
    const index = new Map<string, ActivityTier3WithAncestors>();
    defaultTier3Index.forEach((entry) => {
      index.set(entry.id, entry);
    });
    return index;
  }, []);

  const filterValidCategories = useCallback(
    (ids: string[]) => ids.filter((id) => taxonomyIdSet.has(id)),
    [taxonomyIdSet],
  );

  const selectedCategoryLabels = useMemo(
    () => selectedCategories.map((id) => taxonomyIndex.get(id)?.label ?? id),
    [selectedCategories, taxonomyIndex],
  );

  const getPriceRange = (key: ActivityPriceFilterKey, freeOnly: boolean): [number, number] => {
    if (freeOnly) return [0, 0];
    return resolvePriceRangeForKey(key);
  };

  const priceKeyFromRange = (range: [number, number]): ActivityPriceFilterKey =>
    resolvePriceKeyFromRange(range);

  const timeValuesFromKey = (key: ActivityTimeFilterKey): string[] =>
    resolveTimeValuesFromKey(key);

  const timeKeyFromValues = (values: readonly string[]): ActivityTimeFilterKey =>
    resolveTimeKeyFromValues(values);

  const applyActivityPreferences = useCallback(
    (prefs: ActivityFilterPreferences) => {
      const normalised = normaliseActivityFilterPreferences(prefs);
      setSelectedCategories(filterValidCategories(normalised.categories));
      setDistanceFilter(normalised.radius);
      const isFree = normalised.priceRange[0] === 0 && normalised.priceRange[1] === 0;
      setShowFreeOnly(isFree);
      setPriceFilter(isFree ? "free" : priceKeyFromRange(normalised.priceRange));
      setTimeFilter(timeKeyFromValues(normalised.timeOfDay));
    },
    [filterValidCategories],
  );

  useEffect(() => {
    let cancelled = false;

    const readLocal = async (): Promise<ActivityFilterPreferences | null> => {
      try {
        const raw = await AsyncStorage.getItem(ACTIVITY_LOCAL_KEY);
        if (!raw) return null;
        return normaliseActivityFilterPreferences(JSON.parse(raw) as ActivityFilterPreferences);
      } catch (error) {
        console.warn('[activity-filters] unable to parse cached preferences', error);
        return null;
      }
    };

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        const user = data.user ?? null;
        setUserId(user?.id ?? null);

        if (user?.id) {
          try {
            const remote = await loadUserPreference<ActivityFilterPreferences>(
              supabase,
              user.id,
              'activity_filters',
            );
            if (!cancelled && remote) {
              applyActivityPreferences(remote);
              return;
            }
          } catch (error) {
            console.warn('[activity-filters] failed to load remote preferences', error);
          }
        }

        const local = await readLocal();
        if (!cancelled && local) {
          applyActivityPreferences(local);
        }
      } finally {
        if (!cancelled) {
          setInitialised(true);
          setIsLoadingPrefs(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [applyActivityPreferences]);

  const persistPreferences = useCallback(async () => {
    const prefs = normaliseActivityFilterPreferences({
      radius: distanceFilter,
      priceRange: getPriceRange(priceFilter, showFreeOnly),
      categories: selectedCategories,
      timeOfDay: timeValuesFromKey(timeFilter),
    });

    try {
      await AsyncStorage.setItem(ACTIVITY_LOCAL_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn('[activity-filters] unable to cache filters locally', error);
    }

    if (userId) {
      try {
        await saveUserPreference(supabase, userId, 'activity_filters', prefs);
      } catch (error) {
        console.warn('[activity-filters] failed to persist remote preferences', error);
      }
    }
  }, [distanceFilter, priceFilter, showFreeOnly, selectedCategories, timeFilter, userId]);

  useEffect(() => {
    if (!initialised) return;
    void persistPreferences();
  }, [persistPreferences, initialised]);

  const toggleCategory = useCallback(
    (id: string) => {
      if (!taxonomyIdSet.has(id)) return;
      setSelectedCategories((prev) => {
        const exists = prev.includes(id);
        const next = exists ? prev.filter((category) => category !== id) : [...prev, id];
        trackTaxonomyToggle({
          tier3Id: id,
          active: !exists,
          selectionCount: next.length,
          platform: "mobile",
          surface: "activity_filters",
        });
        return next;
      });
    },
    [taxonomyIdSet],
  );

  const resetFilters = () => {
    setPriceFilter("all");
    setShowFreeOnly(false);
    setDistanceFilter(DEFAULT_ACTIVITY_RADIUS);
    setTimeFilter("any");
    setSelectedCategories([]);
    trackTaxonomyFiltersApplied({
      tier3Ids: [],
      platform: "mobile",
      surface: "activity_filters",
    });
  };

  const applyFilters = () => {
    console.log("Applying filters:", {
      distance: distanceFilter,
      priceRange: getPriceRange(priceFilter, showFreeOnly),
      categories: selectedCategories,
      timeOfDay: timeValuesFromKey(timeFilter),
    });
    trackTaxonomyFiltersApplied({
      tier3Ids: selectedCategories,
      platform: "mobile",
      surface: "activity_filters",
    });
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#E5E7EB"
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginRight: 16,
            padding: 8,
            marginLeft: -8
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={{
          fontSize: 18,
          fontWeight: "600",
          color: "#111827",
          flex: 1,
          textAlign: "center",
          marginRight: 40
        }}>
          Activity Filters
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }}>
        <View style={{ padding: 16 }}>
          {isLoadingPrefs && (
            <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
              Loading your saved preferences…
            </Text>
          )}
          
          {/* Price Filter */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: "600",
              color: "#111827",
              marginBottom: 12
            }}>
              Price Range
            </Text>
            {priceOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                onPress={() => setPriceFilter(option.key)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  backgroundColor: priceFilter === option.key ? "#F0F9FF" : "#F9FAFB",
                  borderRadius: 8,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: priceFilter === option.key ? "#3B82F6" : "#E5E7EB"
                }}
              >
                <View style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: priceFilter === option.key ? "#3B82F6" : "#D1D5DB",
                  backgroundColor: priceFilter === option.key ? "#3B82F6" : "transparent",
                  marginRight: 12,
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  {priceFilter === option.key && (
                    <View style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "#FFFFFF"
                    }} />
                  )}
                </View>
                <Text style={{
                  fontSize: 14,
                  color: priceFilter === option.key ? "#1E40AF" : "#374151",
                  fontWeight: priceFilter === option.key ? "500" : "normal"
                }}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Distance Filter */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: "600",
              color: "#111827",
              marginBottom: 12
            }}>
              Distance (mi)
            </Text>
            <View style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8
            }}>
              {distanceOptions.map((distance) => (
                <TouchableOpacity
                  key={distance}
                  onPress={() => setDistanceFilter(distance)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: distanceFilter === distance ? "#3B82F6" : "#F3F4F6",
                    borderWidth: 1,
                    borderColor: distanceFilter === distance ? "#3B82F6" : "#E5E7EB"
                  }}
                >
                  <Text style={{
                    fontSize: 14,
                    color: distanceFilter === distance ? "#FFFFFF" : "#374151",
                    fontWeight: "500"
                  }}>
                    {distance} mi
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Time Filter */}
          <View style={{ marginBottom: 24 }}>
            <Text style={{
              fontSize: 16,
              fontWeight: "600",
              color: "#111827",
              marginBottom: 12
            }}>
              When
            </Text>
            <View style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8
            }}>
              {timeOptions.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setTimeFilter(option.key)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: timeFilter === option.key ? "#10B981" : "#F3F4F6",
                    borderWidth: 1,
                    borderColor: timeFilter === option.key ? "#10B981" : "#E5E7EB"
                  }}
                >
                  <Text style={{
                    fontSize: 14,
                    color: timeFilter === option.key ? "#FFFFFF" : "#374151",
                    fontWeight: "500"
                  }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Activity Categories */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: "#111827",
                marginBottom: 12,
              }}
            >
              Activity Types
            </Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: "#6B7280" }}>
                {selectedCategories.length === 0
                  ? "No activity types selected"
                  : selectedCategoryLabels.join(", ")}
              </Text>
            </View>
            <TaxonomyCategoryPicker selectedIds={selectedCategories} onToggle={toggleCategory} />
          </View>

          {/* Free Only Toggle */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 16,
            paddingHorizontal: 16,
            backgroundColor: "#F9FAFB",
            borderRadius: 8,
            marginBottom: 32
          }}>
            <View>
              <Text style={{
                fontSize: 16,
                fontWeight: "500",
                color: "#111827"
              }}>
                Free activities only
              </Text>
              <Text style={{
                fontSize: 14,
                color: "#6B7280"
              }}>
                Show only activities that cost $0
              </Text>
            </View>
            <Switch
              value={showFreeOnly}
              onValueChange={(value) => {
                setShowFreeOnly(value);
                if (value) {
                  setPriceFilter("free");
                } else if (priceFilter === "free") {
                  setPriceFilter("all");
                }
              }}
              trackColor={{ false: "#E5E7EB", true: "#10B981" }}
              thumbColor={showFreeOnly ? "#FFFFFF" : "#FFFFFF"}
            />
          </View>
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={{
        flexDirection: "row",
        padding: 16,
        backgroundColor: "#FFFFFF",
        borderTopWidth: 1,
        borderTopColor: "#E5E7EB",
        gap: 12
      }}>
        <TouchableOpacity
          onPress={resetFilters}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 8,
            backgroundColor: "#F3F4F6",
            alignItems: "center"
          }}
        >
          <Text style={{
            fontSize: 16,
            fontWeight: "500",
            color: "#374151"
          }}>
            Reset
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          onPress={applyFilters}
          disabled={isLoadingPrefs}
          style={{
            flex: 2,
            paddingVertical: 12,
            borderRadius: 8,
            backgroundColor: "#3B82F6",
            alignItems: "center",
            opacity: isLoadingPrefs ? 0.6 : 1,
          }}
        >
          <Text style={{
            fontSize: 16,
            fontWeight: "500",
            color: "#FFFFFF"
          }}>
            Apply Filters
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
