import React, { useEffect, useMemo, useState, useRef } from "react"
import { observer } from "mobx-react-lite"
import { FlatList, View, ActivityIndicator, ViewStyle } from "react-native"
import { RouteListScreenProps } from "../../navigators/main-navigator"
import { Screen, RouteDetailsHeader, RouteCard, RouteCardHeight, TicketFaresBottomSheet } from "../../components"
import { useStores } from "../../models"
import { color, spacing } from "../../theme"
import { format, closestIndexTo } from "date-fns"
import { RouteItem } from "../../services/api"
import { RouteListModal } from "./components/route-list-modal"
import { SharedElement } from "react-navigation-shared-element"
import HapticFeedback from "react-native-haptic-feedback"
import BottomSheet from "@gorhom/bottom-sheet"
import { isOldAndroid } from "../../utils/helpers/supported-versions"
import { useQuery } from "react-query"
import { NoTrainsFoundMessage } from "./components/no-trains-found-msg"

const ROOT: ViewStyle = {
  backgroundColor: color.background,
  flex: 1,
}

export const RouteListScreen = observer(function RouteListScreen({ navigation, route }: RouteListScreenProps) {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const { trainRoutes, routePlan } = useStores()
  const bottomSheetRef = useRef<BottomSheet>(null)
  const { originId, destinationId, time, enableQuery } = route.params

  const trains = useQuery(
    ["origin", originId, "destination", destinationId, "time", routePlan.date.getDate()],
    () => trainRoutes.getRoutes(originId, destinationId, time),
    { enabled: enableQuery, retry: false },
  )

  // Set the initial scroll index, since the Israel Rail API ignores the supplied time and
  // returns a route list for the whole day.
  const initialScrollIndex = useMemo(() => {
    if (trains.isSuccess) {
      let index

      if (routePlan.dateType === "departure") {
        const departureTimes = trains.data.map((route) => route.trains[0].departureTime)
        index = closestIndexTo(route.params.time, departureTimes)
      } else if (routePlan.dateType === "arrival") {
        const arrivalTimes = trains.data.map((route) => route.trains[0].arrivalTime)
        index = closestIndexTo(route.params.time, arrivalTimes)
      }

      return index
    }

    return undefined
  }, [trains.isSuccess])

  useEffect(() => {
    if (trainRoutes.resultType === "different-date") {
      setIsModalVisible(true)
    }
  }, [trainRoutes.resultType])

  const renderRouteCard = ({ item }: { item: RouteItem }) => {
    const departureTime = item.trains[0].departureTime
    let arrivalTime = item.trains[0].arrivalTime
    let stops = 0

    // If the train contains an exchange, change to arrival time to the last stop from the last train
    if (item.isExchange) {
      stops = item.trains.length - 1
      arrivalTime = item.trains[stops].arrivalTime
    }

    return (
      <RouteCard
        estTime={item.estTime}
        stops={stops}
        departureTime={departureTime}
        arrivalTime={arrivalTime}
        delay={item.delay}
        onPress={() =>
          navigation.navigate("routeDetails", {
            routeItem: item,
            originId: route.params.originId,
            destinationId: route.params.destinationId,
            date: format(route.params.time, "yyyyMMdd"),
            time: format(route.params.time, "HHmm"),
          })
        }
        style={{ marginBottom: spacing[3] }}
      />
    )
  }

  return (
    <Screen
      style={ROOT}
      preset="fixed"
      unsafe={true}
      statusBar="light-content"
      statusBarBackgroundColor="transparent"
      translucent
    >
      <SharedElement id="route-header">
        <RouteDetailsHeader
          originId={route.params.originId}
          destinationId={route.params.destinationId}
          openFaresBottomSheet={() => {
            HapticFeedback.trigger("impactLight")
            bottomSheetRef.current.expand()
          }}
          style={{ paddingHorizontal: spacing[3], marginBottom: spacing[3] }}
        />
      </SharedElement>

      {trains.status === "loading" && <ActivityIndicator size="large" style={{ marginTop: spacing[6] }} color="grey" />}

      {trains.status === "success" && trains.data.length > 0 && (
        <FlatList
          renderItem={renderRouteCard}
          keyExtractor={(item) => item.trains[0]?.departureTime.toString()}
          data={trains.data}
          contentContainerStyle={{ paddingTop: spacing[4], paddingHorizontal: spacing[3], paddingBottom: spacing[3] }}
          getItemLayout={(_, index) => ({ length: RouteCardHeight, offset: (RouteCardHeight + spacing[3]) * index, index })}
          initialScrollIndex={initialScrollIndex}
        />
      )}

      {trainRoutes.resultType === "not-found" && (
        <View style={{ marginTop: spacing[4] }}>
          <NoTrainsFoundMessage />
        </View>
      )}

      {!isOldAndroid && (
        <TicketFaresBottomSheet
          ref={bottomSheetRef}
          closeBottomSheet={() => bottomSheetRef.current.close()}
          originId={route.params.originId}
          destinationId={route.params.destinationId}
        />
      )}

      {trains.isSuccess && trains.data?.length > 0 && (
        <RouteListModal
          isVisible={isModalVisible}
          onOk={() => setIsModalVisible(false)}
          routesDate={trainRoutes.routes[0]?.departureTime}
        />
      )}
    </Screen>
  )
})
