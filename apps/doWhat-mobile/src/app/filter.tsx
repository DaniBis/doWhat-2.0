import { router } from "expo-router";
import { View, Text, SafeAreaView, TouchableOpacity, StatusBar, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";

type PriceOptionKey = "all" | "free" | "low" | "medium" | "high";
type TimeOptionKey = "anytime" | "today" | "tomorrow" | "weekend" | "week";
type ActivityCategoryKey = "sports" | "fitness" | "social" | "creative" | "outdoor" | "food";
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

export default function FilterScreen() {
  const [priceFilter, setPriceFilter] = useState<PriceOptionKey>("all");
  const [distanceFilter, setDistanceFilter] = useState<number>(10);
  const [timeFilter, setTimeFilter] = useState<TimeOptionKey>("anytime");
  const [showFreeOnly, setShowFreeOnly] = useState(false);
  
  const priceOptions: Array<{ key: PriceOptionKey; label: string }> = [
    { key: "all", label: "All Prices" },
    { key: "free", label: "Free" },
    { key: "low", label: "€1 - €20" },
    { key: "medium", label: "€21 - €50" },
    { key: "high", label: "€50+" }
  ];

  const distanceOptions: number[] = [1, 5, 10, 25, 50];
  
  const timeOptions: Array<{ key: TimeOptionKey; label: string }> = [
    { key: "anytime", label: "Anytime" },
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "weekend", label: "This Weekend" },
    { key: "week", label: "This Week" }
  ];

  const activityCategories: Array<{ key: ActivityCategoryKey; label: string; icon: IoniconName }> = [
    { key: "sports", label: "Sports", icon: "basketball" },
    { key: "fitness", label: "Fitness", icon: "fitness" },
    { key: "social", label: "Social", icon: "people" },
    { key: "creative", label: "Creative", icon: "brush" },
    { key: "outdoor", label: "Outdoor", icon: "leaf" },
    { key: "food", label: "Food & Drink", icon: "restaurant" }
  ];

  const [selectedCategories, setSelectedCategories] = useState<ActivityCategoryKey[]>([]);

  const toggleCategory = (categoryKey: ActivityCategoryKey) => {
    setSelectedCategories(prev => 
      prev.includes(categoryKey) 
        ? prev.filter(c => c !== categoryKey)
        : [...prev, categoryKey]
    );
  };

  const resetFilters = () => {
    setPriceFilter("all");
    setDistanceFilter(10);
    setTimeFilter("anytime");
    setShowFreeOnly(false);
    setSelectedCategories([]);
  };

  const applyFilters = () => {
    // TODO: Wire these into query params for Home/Map in a follow-up
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
              Distance (km)
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
                    {distance} km
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
            <Text style={{
              fontSize: 16,
              fontWeight: "600",
              color: "#111827",
              marginBottom: 12
            }}>
              Activity Types
            </Text>
            <View style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8
            }}>
              {activityCategories.map((category) => (
                <TouchableOpacity
                  key={category.key}
                  onPress={() => toggleCategory(category.key)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: selectedCategories.includes(category.key) ? "#8B5CF6" : "#F3F4F6",
                    borderWidth: 1,
                    borderColor: selectedCategories.includes(category.key) ? "#8B5CF6" : "#E5E7EB"
                  }}
                >
                  <Ionicons 
                    name={category.icon} 
                    size={16} 
                    color={selectedCategories.includes(category.key) ? "#FFFFFF" : "#6B7280"} 
                    style={{ marginRight: 6 }}
                  />
                  <Text style={{
                    fontSize: 14,
                    color: selectedCategories.includes(category.key) ? "#FFFFFF" : "#374151",
                    fontWeight: "500"
                  }}>
                    {category.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
                Show only activities that cost €0
              </Text>
            </View>
            <Switch
              value={showFreeOnly}
              onValueChange={setShowFreeOnly}
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
          style={{
            flex: 2,
            paddingVertical: 12,
            borderRadius: 8,
            backgroundColor: "#3B82F6",
            alignItems: "center"
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
