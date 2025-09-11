import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useEffect } from 'react';

export default function TabsLayout() {
  useEffect(() => {
    console.log('TabsLayout component mounted successfully!');
  }, []);

  return (
    <Tabs
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: () => <Text>🏠</Text>,
        }}
      />
    </Tabs>
  );
}
