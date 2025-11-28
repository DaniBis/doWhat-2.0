import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { activityTaxonomy } from "@dowhat/shared";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

type ActivityTier3Category = {
  id: string;
  label: string;
  description: string;
};

type ActivityTier2Category = {
  id: string;
  label: string;
  description: string;
  children: ActivityTier3Category[];
};

type ActivityTier1Category = {
  id: string;
  label: string;
  description: string;
  iconKey: string;
  colorToken: string;
  children: ActivityTier2Category[];
};

type TaxonomyCategoryPickerProps = {
  selectedIds: string[];
  onToggle: (tier3Id: string) => void;
};

const COLOR_TOKEN_MAP: Record<string, string> = {
  "emerald-500": "#10B981",
  "amber-500": "#F59E0B",
  "sky-500": "#0EA5E9",
  "rose-500": "#F43F5E",
  "lime-500": "#84CC16",
  "violet-500": "#8B5CF6",
};

const ICON_MAP: Record<string, IoniconName> = {
  "activity-run": "walk-outline",
  brush: "color-palette-outline",
  people: "people-outline",
  compass: "compass-outline",
  leaf: "leaf-outline",
  spark: "sparkles-outline",
};

const getAccentColor = (category: ActivityTier1Category) =>
  COLOR_TOKEN_MAP[category.colorToken] ?? "#6366F1";

const getIconName = (category: ActivityTier1Category): IoniconName =>
  ICON_MAP[category.iconKey] ?? "apps-outline";

const TaxonomyCategoryPicker: React.FC<TaxonomyCategoryPickerProps> = ({
  selectedIds,
  onToggle,
}) => {
  const selectionSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    activityTaxonomy.forEach((tier1: ActivityTier1Category, index: number) => {
      initial[tier1.id] = index === 0;
    });
    return initial;
  });

  const toggleSection = (id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <View style={styles.container}>
      {activityTaxonomy.map((tier1: ActivityTier1Category) => {
        const accent = getAccentColor(tier1);
        const iconName = getIconName(tier1);
        const tier1SelectionCount = tier1.children.reduce((sum: number, tier2: ActivityTier2Category) => {
          const tier3Count = tier2.children.filter((tier3: ActivityTier3Category) => selectionSet.has(tier3.id)).length;
          return sum + tier3Count;
        }, 0);
        const isExpanded = expanded[tier1.id];
        return (
          <View key={tier1.id} style={styles.tier1Section}>
            <TouchableOpacity
              onPress={() => toggleSection(tier1.id)}
              style={styles.tier1Header}
              accessibilityRole="button"
            >
              <View style={styles.tier1HeaderLeft}>
                <View style={[styles.iconBadge, { borderColor: accent }]}> 
                  <Ionicons name={iconName} size={18} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tier1Label}>{tier1.label}</Text>
                  <Text style={styles.tier1Description}>{tier1.description}</Text>
                </View>
              </View>
              <View style={styles.tier1HeaderRight}>
                {tier1SelectionCount ? (
                  <Text style={[styles.selectionCount, { color: accent }]}>
                    {tier1SelectionCount} selected
                  </Text>
                ) : null}
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#6B7280"
                />
              </View>
            </TouchableOpacity>
            {isExpanded ? (
              <View style={styles.tier1Body}>
                {tier1.children.map((tier2: ActivityTier2Category) => (
                  <View key={tier2.id} style={styles.tier2Section}>
                    <Text style={styles.tier2Label}>{tier2.label}</Text>
                    <Text style={styles.tier2Description}>{tier2.description}</Text>
                    <View style={styles.chipGroup}>
                      {tier2.children.map((tier3: ActivityTier3Category) => {
                        const active = selectionSet.has(tier3.id);
                        return (
                          <TouchableOpacity
                            key={tier3.id}
                            onPress={() => onToggle(tier3.id)}
                            style={[styles.chip, active ? [styles.chipActive, { borderColor: accent, backgroundColor: `${accent}1A` }] : styles.chipInactive]}
                          >
                            <Text style={[styles.chipText, active && { color: accent }]}>{tier3.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  tier1Section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tier1Header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tier1HeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  tier1HeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginRight: 12,
    backgroundColor: "#F8FAFC",
  },
  tier1Label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  tier1Description: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  tier1Body: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
    gap: 16,
  },
  tier2Section: {
    gap: 6,
  },
  tier2Label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  tier2Description: {
    fontSize: 12,
    color: "#6B7280",
  },
  chipGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipInactive: {
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  chipActive: {
    backgroundColor: "#EEF2FF",
  },
  chipText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  selectionCount: {
    fontSize: 12,
    fontWeight: "600",
  },
});

export default TaxonomyCategoryPicker;
