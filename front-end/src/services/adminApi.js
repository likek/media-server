import request from "./request"

export const getUserList = (page, pageSize) => {
    return request.p('/admin/users', {
        page,
        pageSize
    })
}