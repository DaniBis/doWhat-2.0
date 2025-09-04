import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

type Props = {
  attendeesCount: number;
  goingCount: number;
  interestedCount: number;
  onPressAttendees: () => void;
};

const AttendanceInfo: React.FC<Props> = ({
  attendeesCount,
  goingCount,
  interestedCount,
  onPressAttendees,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.attendanceRow}>
        <Text style={styles.title}>Attendance</Text>
        <TouchableOpacity onPress={onPressAttendees}>
          <Text style={styles.viewAllText}>View All</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{attendeesCount}</Text>
          <Text style={styles.statLabel}>Attendees</Text>
        </View>
        <View style={[styles.divider, { height: '70%' }]} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{goingCount}</Text>
          <Text style={styles.statLabel}>Going</Text>
        </View>
        <View style={[styles.divider, { height: '70%' }]} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{interestedCount}</Text>
          <Text style={styles.statLabel}>Interested</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: 'white',
    marginTop: 8,
  },
  attendanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  viewAllText: {
    fontSize: 14,
    color: '#2C7BF6',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 14,
    color: '#777',
    marginTop: 4,
  },
  divider: {
    width: 1,
    backgroundColor: '#E5E7EB',
  },
});

export default AttendanceInfo;
