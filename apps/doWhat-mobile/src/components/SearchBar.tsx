import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@dowhat/shared';

type SearchBarProps = {
  onSearch: (query: string) => void;
  onFilter: () => void;
  placeholder?: string;
  showFilterButton?: boolean;
  suggestedSearches?: string[];
};

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  onFilter,
  placeholder = 'Search activities...',
  showFilterButton = true,
  suggestedSearches = [],
}) => {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    onSearch(searchQuery);
  };

  const handleSuggestionPress = (suggestion: string) => {
    handleSearch(suggestion);
    setFocused(false);
  };

  const clearSearch = () => {
    setQuery('');
    onSearch('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, focused && styles.searchBarFocused]}>
          <Ionicons
            name="search"
            size={20}
            color={focused ? theme.colors.brandTeal : theme.colors.ink40}
            style={styles.searchIcon}
          />
          
          <TextInput
            style={styles.searchInput}
            placeholder={placeholder}
            value={query}
            onChangeText={handleSearch}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholderTextColor={theme.colors.ink40}
          />
          
          {query.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color={theme.colors.ink40} />
            </TouchableOpacity>
          )}
        </View>

        {showFilterButton && (
          <TouchableOpacity style={styles.filterButton} onPress={onFilter}>
            <Ionicons name="options" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {focused && suggestedSearches.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>Suggested</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsScrollView}
          >
            {suggestedSearches.map((suggestion, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionChip}
                onPress={() => handleSuggestionPress(suggestion)}
              >
                <Ionicons name="trending-up" size={14} color={theme.colors.ink40} />
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  searchBarFocused: {
    borderColor: theme.colors.brandTeal,
    backgroundColor: theme.colors.surface,
    shadowColor: theme.colors.brandTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.brandInk,
    fontWeight: '600',
  },
  clearButton: {
    padding: 4,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.brandTeal,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.brandTeal,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  suggestionsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: theme.colors.ink40,
    marginBottom: 8,
  },
  suggestionsScrollView: {
    paddingRight: 16,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  suggestionText: {
    fontSize: 13,
    color: theme.colors.ink60,
    marginLeft: 4,
    fontWeight: '600',
  },
});

export default SearchBar;
