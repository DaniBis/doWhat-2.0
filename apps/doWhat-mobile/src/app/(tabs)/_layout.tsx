import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useEffect } from 'react';

export default function TabsLayout() {
  useEffect(() => {
    console.log('TabsLayout mounted');
  }, []);

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        tabBarActiveTintColor: '#2C7BF6',
        tabBarInactiveTintColor: '#6B7280',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'white',
          height: 60,
        },
      }}
    >
  {/* Hide the redirect-only index route from the tab bar */}
  <Tabs.Screen name="index" options={{ href: null }} />
      {/* Detail screens live inside the tab navigator so the bottom bar stays visible */}
      <Tabs.Screen name="activities/[id]" options={{ href: null }} />
      <Tabs.Screen name="sessions/[id]" options={{ href: null }} />
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: () => <Text>🏠</Text>,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: () => <Text>🗺️</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: () => <Text>👤</Text>,
        }}
      />
    </Tabs>
  );
}
