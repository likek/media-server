import request from "./request"

export const getUserList = (page, limit) => {
    return request.post('/admin/users', {
        page,
        limit
    })
}