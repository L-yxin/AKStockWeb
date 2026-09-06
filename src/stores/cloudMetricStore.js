export const useCloudMetricStore = defineStore('cloudMetric',()=> {
    const metricList = ref([])
    const listLoading = ref(false)
    return {
        metricList,
        listLoading
    }
})